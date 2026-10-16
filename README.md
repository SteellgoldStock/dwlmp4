# À garder.

Une petite application personnelle pour enregistrer les **Reels Instagram et vidéos TikTok publics en MP4**, sans publicité, sans compte à connecter et sans service tiers de téléchargement.

Interface en français, suivi de la préparation, téléchargement du fichier, gestion des erreurs et affichage adapté au téléphone. Les liens courts TikTok sont acceptés. **Aucune garantie de suppression du filigrane.**

## Démarrer sur son ordinateur

Prérequis : **Node.js 22.19 ou plus récent**, npm et une connexion Internet. Aucun Python à installer sur les plateformes prises en charge.

```bash
npm install
npm run setup:engine
npm run dev
```

Ouvrez **http://127.0.0.1:5173**. Collez le lien d’une vidéo publique, cliquez sur « Récupérer la vidéo », puis sur « Télécharger le MP4 ».

Le script d’installation récupère le binaire stable officiel de [yt-dlp](https://github.com/yt-dlp/yt-dlp), vérifie son SHA-256, puis vérifie FFmpeg (fourni par `ffmpeg-static`). Linux x64/ARM64, macOS Intel/Apple Silicon et Windows x64/ARM64 sont pris en charge par le script ; la disponibilité de FFmpeg dépend aussi de la plateforme. Il faut pouvoir accéder à GitHub lors de l’installation.

### Version compilée

```bash
npm run build
npm start
```

L’interface et l’API sont alors disponibles sur **http://127.0.0.1:3000**.

### Docker

```bash
docker build -t a-garder .
docker run --rm --init -p 127.0.0.1:3000:3000 a-garder
```

Les fichiers temporaires restent dans le conteneur. Aucun volume n’est nécessaire. Pour mettre le moteur à jour, reconstruisez l’image avec `docker build --no-cache -t a-garder .`.

## Ce que l’application fait — et ne fait pas

- **Oui :** Reels et publications vidéo Instagram, vidéos TikTok, liens courts `vm.tiktok.com`, `vt.tiktok.com` et `/t/…`.
- **Non :** comptes privés, connexion par cookies, Stories, profils entiers, directs, diaporamas photo, contournement de restrictions ou suppression des crédits.
- **Limites :** 200 Mio par vidéo (affichés « Mo » dans l’interface), 20 minutes de durée, 3 minutes de préparation, deux récupérations simultanées et dix demandes par IP en dix minutes. Vingt tâches au maximum sont conservées à la fois.
- Le serveur stocke les MP4 **30 minutes après préparation**, puis les efface lors du nettoyage périodique (chaque minute). Les fichiers sont aussi effacés à l’arrêt normal. Les tâches expirées sont immédiatement inaccessibles. Un arrêt brutal du processus peut laisser des dossiers `a-garder-*` dans le répertoire temporaire du système ; ils ne sont pas réutilisés au redémarrage.
- Pas d’historique persistant, de cookies applicatifs, de suivi publicitaire, d’analytics ou de ressources visuelles distantes. Le serveur contacte nécessairement Instagram/TikTok et leurs serveurs vidéo : votre IP serveur leur est visible.
- L’application conserve le format disponible, privilégie une vidéo MP4 jusqu’à 1080p, et assemble/remuxe avec FFmpeg si nécessaire. La sélection n’augmente pas la qualité de la source.

**Une vidéo publique n’est pas forcément téléchargeable :** Instagram/TikTok peuvent exiger une connexion, limiter l’IP du serveur, bloquer un hébergement ou modifier leurs API. L’application affiche alors une erreur ; elle ne contourne pas ces restrictions. Le fonctionnement réel dépend de la plateforme et de la version de yt-dlp.

Utilisez uniquement les vidéos que vous avez le droit de télécharger et respectez les conditions des plateformes et les droits des créateurs. Un usage personnel ne donne pas automatiquement tous les droits de copie ou de republication.

## Entretien et configuration

Si une plateforme change son fonctionnement, mettez le moteur à jour :

```bash
npm run setup:engine
```

Variables d’environnement facultatives (à définir dans votre terminal ou votre hébergeur ; les fichiers `.env` ne sont pas chargés automatiquement) :

| Variable      | Par défaut                                          | Rôle                                                                    |
| ------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| `HOST`        | `127.0.0.1`                                         | Adresse d’écoute de l’API ; `0.0.0.0` pour un conteneur.                |
| `PORT`        | `3001` en développement, `3000` en version compilée | Port de l’API (également utilisé par le proxy Vite en développement).   |
| `VITE_PORT`   | `5173`                                              | Port de l’interface en développement, si le port par défaut est occupé. |
| `YTDLP_PATH`  | `.bin/yt-dlp` (ou `.exe`)                           | Chemin **absolu** vers un autre exécutable yt-dlp récent.               |
| `FFMPEG_PATH` | Binaire `ffmpeg-static`                             | Chemin **absolu** vers FFmpeg.                                          |

**Prévu pour une utilisation locale ou privée.** N’exposez pas cette application telle quelle sur Internet : elle n’intègre pas d’authentification. Pour un accès distant, ajoutez une authentification et HTTPS au niveau d’un reverse proxy, gardez la même origine pour l’interface et l’API, et limitez les sorties réseau du conteneur. Ne configurez pas aveuglément la confiance dans les en-têtes de proxy : les limites de débit sont par IP de connexion.

Les URL entrantes sont limitées aux domaines et chemins vidéo attendus, les redirections des liens courts sont validées, l’exécution de yt-dlp n’utilise pas de shell et les fichiers sont servis uniquement via des identifiants aléatoires. Ces protections ne remplacent pas l’isolation réseau d’un serveur public ni la mise à jour de yt-dlp.

## Développement et tests

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Sur une installation Linux minimale, Chromium nécessite aussi des bibliothèques système : `npx playwright install --with-deps chromium` les installe si votre compte dispose des permissions nécessaires. Elles ne sont pas requises pour utiliser l’application, uniquement pour les tests navigateur.

- React + Vite pour l’interface, Express + TypeScript pour l’API.
- `server/urls.ts` : validation et résolution des liens courts.
- `server/engine.ts` : exécution réelle de yt-dlp, limites et progression.
- `server/downloads.ts` : tâches en mémoire, fichiers temporaires et expiration.
- `tests/` : tests de validation, sécurité et cycle de téléchargement avec moteur injecté. Si le moteur est installé, un test supplémentaire utilise les vrais binaires yt-dlp + FFmpeg pour récupérer et remuxer une vidéo générée localement, sans accès Internet.
- `e2e/` : parcours navigateur desktop/mobile avec API simulée ; ces tests ne prouvent pas l’accessibilité actuelle d’une vidéo Instagram/TikTok.

API : `GET /api/health`, `POST /api/downloads` avec `{ "url": "https://…" }`, `GET /api/downloads/:id`, puis `GET /api/downloads/:id/file`. L’API doit être utilisée depuis la même origine que l’interface.

yt-dlp et FFmpeg sont des projets tiers avec leurs propres licences. Consultez leurs licences et celles du binaire FFmpeg avant toute redistribution.
