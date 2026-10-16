import express, { type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import type { DownloadService } from './downloads.js';
import { PublicError } from './urls.js';

export function createApp(service: DownloadService, production = false) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (production)
      response.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
    next();
  });
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (request, _response, next) => {
    if (request.method === 'POST') {
      if (!request.is('application/json'))
        return next(new PublicError('Le corps de la requête doit être au format JSON.', 415));
      const origin = request.get('origin');
      if (request.get('sec-fetch-site') === 'cross-site')
        return next(new PublicError('Requête externe non autorisée.', 403));
      if (origin) {
        try {
          const url = new URL(origin);
          if (!['http:', 'https:'].includes(url.protocol) || url.host !== request.get('host'))
            throw new Error();
        } catch {
          return next(new PublicError('Requête externe non autorisée.', 403));
        }
      }
    }
    next();
  });
  app.use(express.json({ limit: '4kb' }));

  app.get('/api/health', async (_request, response) => {
    response.json(await service.health());
  });
  const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Dix demandes en dix minutes maximum. Patientez un peu avant de réessayer.' },
  });
  app.post('/api/downloads', limiter, async (request, response) => {
    response.status(202).json(await service.create(request.body?.url));
  });
  app.get('/api/downloads/:id', (request, response) => {
    response.json(service.get(request.params.id));
  });
  app.get('/api/downloads/:id/file', (request, response, next) => {
    const file = service.file(request.params.id);
    response.type('video/mp4');
    response.download(file.path, file.name, (error) => {
      if (error && !response.headersSent)
        next(
          new PublicError(
            'Le fichier a expiré ou n’est plus disponible. Récupérez à nouveau la vidéo.',
            404,
          ),
        );
    });
  });
  app.use('/api', (_request, _response, next) => {
    next(new PublicError('Cette route n’existe pas.', 404));
  });
  if (production) {
    app.use(express.static(path.resolve('dist/client')));
    app.get('/{*path}', (_request, response) => {
      response.sendFile(path.resolve('dist/client/index.html'));
    });
  }
  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (response.headersSent) return;
    if (error instanceof PublicError)
      response.status(error.statusCode).json({ error: error.message });
    else if (error instanceof SyntaxError)
      response.status(400).json({ error: 'Le JSON envoyé n’est pas valide.' });
    else if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      response.status(413).json({ error: 'La requête est trop volumineuse.' });
    } else
      response
        .status(500)
        .json({ error: 'Une erreur est survenue sur le serveur. Réessayez dans un instant.' });
  };
  app.use(errorHandler);
  return app;
}
