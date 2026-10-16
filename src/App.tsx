import { useRef, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  Clipboard,
  Clock3,
  FileVideo2,
  Heart,
  Instagram,
  Leaf,
  Link2,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { DownloadJob } from '../shared/types';
import { useDownload } from './useDownload';

function TikTok({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 2c.4 2.8 1.9 4.4 4.4 4.6v3.6a10 10 0 0 1-4.4-1.4v7a6.3 6.3 0 1 1-5.4-6.2v3.7a2.6 2.6 0 1 0 1.8 2.5V2z" />
    </svg>
  );
}

function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <a className={`brand ${footer ? 'brand-small' : ''}`} href="#" aria-label="À garder, accueil">
      <span className="brand-icon">
        <ArrowDownToLine size={23} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span>
        à garder<span className="brand-period">.</span>
      </span>
    </a>
  );
}

function RecipeIllustration() {
  return (
    <div className="little-scene" aria-hidden="true">
      <div className="scene-spark spark-one">✧</div>
      <div className="recipe-card recipe-back">
        <span />
        <span />
        <span />
      </div>
      <div className="recipe-card recipe-front">
        <div className="pasta-art">
          <svg viewBox="0 0 190 125" fill="none">
            <ellipse cx="96" cy="76" rx="67" ry="38" fill="#cfb99a" opacity=".35" />
            <ellipse cx="93" cy="66" rx="69" ry="42" fill="#fcf8e9" />
            <ellipse cx="93" cy="65" rx="53" ry="30" stroke="#d8d7b9" strokeWidth="1.5" />
            <path
              d="M57 59c9-18 28-6 37-11s23-8 29 4-16 13-26 9-27-11-32 0 16 20 28 15 30-20 35-9-17 18-26 15-37-9-41-16 10-21 24-12 11 21 25 15 7-18-4-17-25 4-22 12 21 9 27 4"
              stroke="#dea152"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M85 49c-14-18-25-9-17-1s17 1 17 1Zm20 21c15-13 23-3 15 3s-15-3-15-3Zm-13 8c-15 3-12 13-3 11s3-11 3-11Z"
              fill="#527553"
            />
            <path
              d="m81 58 3 2m22-13 3 2m-6 29 3 2m-37-8 3 2m42-12 3 2"
              stroke="#fff8d9"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="m151 23 13 37m-8-39 12 37m-7-39 12 37m-11-15 7 21 12 33"
              stroke="#82765f"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
          <span className="art-play">▶</span>
        </div>
        <span className="recipe-caption">La recette du dimanche</span>
        <div className="recipe-meta">
          <span>À tester absolument</span>
          <Bookmark size={12} fill="currentColor" />
        </div>
      </div>
      <div className="saved-sticker">
        <Check size={13} strokeWidth={3} /> Dans la poche !
      </div>
      <div className="scene-spark spark-two">✧</div>
    </div>
  );
}

function formatSize(bytes: number) {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} Mo`;
}
function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function JobProgress({ job, paused }: { job: DownloadJob; paused: boolean }) {
  const label = paused
    ? 'Le suivi est en pause'
    : job.status === 'processing'
      ? 'On retrouve votre vidéo…'
      : job.status === 'converting'
        ? 'Une dernière touche au MP4…'
        : 'Votre vidéo arrive…';
  return (
    <div className="job-progress" role="status" aria-live="polite">
      <div className="progress-top">
        <span className="working-icon">
          <LoaderCircle className={paused ? '' : 'spin'} size={21} />
        </span>
        <div>
          <strong>{label}</strong>
          <p>
            {job.status === 'processing'
              ? 'Vérification du lien et de l’accès public.'
              : job.status === 'converting'
                ? 'Assemblage de la vidéo et du son.'
                : 'La durée dépend de la vidéo et de la plateforme.'}
          </p>
        </div>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Récupération de la vidéo"
        aria-valuenow={Math.round(job.progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${job.progress}%` }} />
      </div>
      <div className="progress-bottom">
        <span>{job.platform === 'instagram' ? 'Instagram' : 'TikTok'} → MP4</span>
        <span>{Math.round(job.progress)} %</span>
      </div>
      {job.title && <p className="progress-title">{job.title}</p>}
    </div>
  );
}

export function App() {
  const [url, setUrl] = useState('');
  const [clipboardNotice, setClipboardNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const download = useDownload();
  const busy = download.submitting || download.active;
  const ready = download.job?.status === 'ready';
  const failed = download.job?.status === 'error';
  const detected = /(?:^|\.)instagram\.com\//i.test(url.replace(/^https?:\/\//, ''))
    ? 'instagram'
    : /(?:^|\.)tiktok\.com\//i.test(url.replace(/^https?:\/\//, ''))
      ? 'tiktok'
      : null;

  async function paste() {
    try {
      setUrl((await navigator.clipboard.readText()).trim());
      setClipboardNotice('');
    } catch {
      setClipboardNotice('Le presse-papiers est inaccessible. Collez le lien avec Ctrl+V ou ⌘V.');
    }
    input.current?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setClipboardNotice('');
    void download.submit(url);
  }

  function reset() {
    download.reset();
    setUrl('');
    setClipboardNotice('');
    requestAnimationFrame(() => input.current?.focus());
  }

  return (
    <>
      <a className="skip-link" href="#telecharger">
        Aller au téléchargement
      </a>
      <header className="site-header page-width">
        <Brand />
        <nav aria-label="Navigation principale">
          <a href="#comment-ca-marche">
            Comment ça marche <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <span className="header-pill">
            <span /> Moins de pubs. Plus de vous.
          </span>
        </nav>
      </header>

      <main>
        <section className="hero page-width" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-line" /> LE PETIT OUTIL QUI VA À L’ESSENTIEL
            </div>
            <h1 id="hero-title">
              Un lien.
              <br />
              Une vidéo.
              <br />
              <span className="hero-last">
                À <em>garder.</em>
                <svg viewBox="0 0 310 18" aria-hidden="true">
                  <path d="M5 11C82 0 192 1 303 9M61 15c66-8 149-7 213-2" />
                </svg>
              </span>
            </h1>
            <p className="hero-description">
              La recette à tester, l’idée à retrouver,
              <br className="desktop-break" /> la vidéo qui mérite mieux qu’un onglet oublié.
            </p>
            <p className="hero-description hero-description-secondary">
              Vos Reels et TikToks en MP4. Tout simplement.
            </p>
            <div className="hero-benefits">
              <span>
                <Check size={15} /> Sans publicité
              </span>
              <span>
                <Check size={15} /> Sans compte
              </span>
              <span>
                <Check size={15} /> Juste la vidéo
              </span>
            </div>
            <div className="hero-note">
              <RecipeIllustration />
              <div className="note-copy">
                <span>Moins de « c’était où, déjà ? »</span>
                <svg viewBox="0 0 73 32" aria-hidden="true">
                  <path d="M69 4C51 26 28 28 7 18m0 0 13-1M7 18l6 9" />
                </svg>
              </div>
            </div>
          </div>

          <div className="download-column">
            <div className="download-card" id="telecharger">
              <div className="card-heading">
                <div className="heading-icon">
                  <ArrowDownToLine size={25} strokeWidth={1.6} />
                </div>
                <span>
                  Un petit lien, un grand service.
                  <Sparkles size={17} />
                </span>
              </div>
              <div className="card-body">
                <div className="platforms">
                  <span className={detected === 'instagram' ? 'platform selected' : 'platform'}>
                    <Instagram size={16} /> Instagram
                  </span>
                  <span className="platform-plus">+</span>
                  <span className={detected === 'tiktok' ? 'platform selected' : 'platform'}>
                    <TikTok size={15} /> TikTok
                  </span>
                  <span className="platform-label">Le duo gagnant.</span>
                </div>
                <h2>Gardez ce qui vous plaît.</h2>
                <p className="card-intro">
                  Collez le lien. Récupérez le MP4.
                  <br />
                  Retournez à ce qui compte.
                </p>

                {!ready && !failed && (
                  <form onSubmit={submit}>
                    <label htmlFor="video-url">
                      Le lien de votre vidéo <Link2 size={15} aria-hidden="true" />
                    </label>
                    <div className={`url-field ${busy ? 'field-disabled' : ''}`}>
                      <Link2 size={19} aria-hidden="true" />
                      <input
                        ref={input}
                        id="video-url"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="https://www.instagram.com/reel/…"
                        value={url}
                        onChange={(event) => {
                          setUrl(event.target.value);
                          setClipboardNotice('');
                        }}
                        disabled={busy}
                        required
                        maxLength={2048}
                        aria-describedby="url-help clipboard-notice"
                      />
                      <button
                        className="paste-button"
                        type="button"
                        onClick={() => {
                          void paste();
                        }}
                        disabled={busy}
                        title="Coller depuis le presse-papiers"
                        aria-label="Coller le lien"
                      >
                        <Clipboard size={17} />
                        <span>Coller</span>
                      </button>
                    </div>
                    <p id="url-help" className="field-help">
                      Un Reel Instagram ou une vidéo TikTok publique.
                    </p>
                    <p id="clipboard-notice" className="clipboard-notice" role="status">
                      {clipboardNotice}
                    </p>
                    {!download.active && (
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={busy || !url.trim() || download.health?.ready !== true}
                      >
                        {download.submitting ? (
                          <>
                            <LoaderCircle size={19} className="spin" /> On ouvre le lien…
                          </>
                        ) : (
                          <>
                            Récupérer la vidéo <ArrowRight size={19} />
                          </>
                        )}
                      </button>
                    )}
                  </form>
                )}

                {download.active && download.job && (
                  <JobProgress job={download.job} paused={download.paused} />
                )}
                {(download.error || failed) && (
                  <div className="notice error-notice" role="alert">
                    <TriangleAlert size={18} />
                    <div>
                      <strong>Un petit contretemps.</strong>
                      <p>{download.error || download.job?.error}</p>
                      {download.paused && (
                        <button className="text-button" onClick={download.resume}>
                          <RotateCcw size={14} /> Reprendre le suivi
                        </button>
                      )}
                      {failed && (
                        <button
                          className="text-button"
                          onClick={() => {
                            download.reset();
                            input.current?.focus();
                          }}
                        >
                          <RotateCcw size={14} /> Réessayer avec ce lien
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {download.paused && (
                  <button className="text-button abandon-button" onClick={reset}>
                    <X size={14} /> Revenir au formulaire
                  </button>
                )}

                {ready && download.job && (
                  <div className="result" role="status">
                    <div className="result-banner">
                      <span className="success-icon">
                        <CheckCheck size={22} />
                      </span>
                      <div>
                        <strong>
                          {download.expired ? 'Ce fichier a expiré.' : 'C’est dans la poche.'}
                        </strong>
                        <p>
                          {download.expired
                            ? 'Récupérez la vidéo à nouveau pour la télécharger.'
                            : 'Votre vidéo est prête à vous suivre.'}
                        </p>
                      </div>
                    </div>
                    {!download.expired && (
                      <>
                        <div className="video-result">
                          <div className="video-file-icon">
                            <FileVideo2 size={29} strokeWidth={1.5} />
                            <span>MP4</span>
                          </div>
                          <div className="video-details">
                            <strong>{download.job.title || 'Votre vidéo'}</strong>
                            {download.job.uploader && <span>{download.job.uploader}</span>}
                            <p>
                              MP4 {download.job.size ? `· ${formatSize(download.job.size)}` : ''}
                              {download.job.duration
                                ? ` · ${formatDuration(download.job.duration)}`
                                : ''}
                            </p>
                          </div>
                        </div>
                        <a
                          className="primary-button"
                          href={`/api/downloads/${download.job.id}/file`}
                          download
                        >
                          Télécharger le MP4 <ArrowDownToLine size={19} />
                        </a>
                        <p className="expiry-note">
                          <Clock3 size={12} /> Disponible 30 minutes, puis effacé du serveur.
                        </p>
                      </>
                    )}
                    <button className="text-button another-button" onClick={reset}>
                      <RotateCcw size={14} />{' '}
                      {download.expired ? 'Récupérer une vidéo' : 'Une autre vidéo ?'}
                    </button>
                  </div>
                )}

                {download.health && !download.health.ready && !download.active && !ready && (
                  <div className="notice engine-notice" role="status">
                    <TriangleAlert size={17} />
                    <div>
                      <strong>Le moteur attend son démarrage.</strong>
                      <p>{download.health.message}</p>
                      <button
                        className="text-button"
                        onClick={() => {
                          void download.checkHealth();
                        }}
                      >
                        <RotateCcw size={13} /> Vérifier à nouveau
                      </button>
                    </div>
                  </div>
                )}
                {!ready && (
                  <div className="card-reassurance">
                    <LockKeyhole size={13} />
                    <span>Aucun compte à connecter. Aucun mot de passe.</span>
                  </div>
                )}
              </div>
              <div className="card-footer">
                <ShieldCheck size={16} />
                <span>Un outil personnel. Pas une usine à pubs.</span>
                <Leaf size={16} />
              </div>
            </div>
            <p className="under-card">
              <Heart size={13} /> Pour les bonnes trouvailles, pas pour les contenus privés.
            </p>
          </div>
        </section>

        <section
          className="how-section page-width"
          id="comment-ca-marche"
          aria-labelledby="how-title"
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">PAS DE MODE D’EMPLOI À RALLONGE</span>
              <h2 id="how-title">Trois petits gestes. Et c’est tout.</h2>
            </div>
            <span className="handwritten">
              Promis, c’est vraiment simple.
              <svg viewBox="0 0 50 30" aria-hidden="true">
                <path d="M2 3c18 0 20 21 42 21m0 0-7-7m7 7-9 3" />
              </svg>
            </span>
          </div>
          <div className="steps">
            <article className="step">
              <span className="step-number">01</span>
              <div className="step-symbol">
                <Link2 size={23} strokeWidth={1.6} />
              </div>
              <h3>Repérez la pépite.</h3>
              <p>
                Dans Instagram ou TikTok, ouvrez
                <br className="desktop-break" /> « Partager », puis « Copier le lien ».
              </p>
              <ArrowRight className="step-arrow" size={20} />
            </article>
            <article className="step">
              <span className="step-number">02</span>
              <div className="step-symbol">
                <Clipboard size={23} strokeWidth={1.6} />
              </div>
              <h3>Déposez le lien ici.</h3>
              <p>
                Collez-le dans le champ ci-dessus.
                <br className="desktop-break" /> On s’occupe de préparer la vidéo.
              </p>
              <ArrowRight className="step-arrow" size={20} />
            </article>
            <article className="step">
              <span className="step-number">03</span>
              <div className="step-symbol">
                <ArrowDownToLine size={23} strokeWidth={1.6} />
              </div>
              <h3>Gardez-la sous la main.</h3>
              <p>
                Téléchargez le MP4 sur votre appareil.
                <br className="desktop-break" /> À revoir même sans connexion.
              </p>
              <Check size={19} className="step-check" />
            </article>
          </div>
        </section>

        <section className="bottom-section page-width" aria-labelledby="faq-title">
          <div className="good-use">
            <span className="good-use-icon">
              <Bookmark size={24} strokeWidth={1.5} />
            </span>
            <div>
              <h2>
                Les bonnes vidéos restent.
                <br />
                Le respect des créateurs aussi.
              </h2>
              <p>
                Gardez les vidéos que vous avez le droit de télécharger, pour votre usage personnel.
                Ne les republiez pas sans l’accord de leur auteur.
              </p>
              <span className="small-signature">
                Un peu de bon sens, beaucoup de bonnes idées. <Heart size={12} />
              </span>
            </div>
          </div>
          <div className="faq">
            <h2 id="faq-title">Au fait, quelques réponses.</h2>
            <details>
              <summary>
                Quelles vidéos peut-on récupérer ?<ChevronDown size={17} />
              </summary>
              <p>
                Les Reels et publications vidéo Instagram, ainsi que les vidéos TikTok accessibles
                publiquement. Les profils, Stories, directs, contenus privés et diaporamas photo ne
                sont pas pris en charge. Une vidéo publique peut aussi être bloquée par la
                plateforme.
              </p>
            </details>
            <details>
              <summary>
                Où vont mes vidéos et mes liens ?<ChevronDown size={17} />
              </summary>
              <p>
                Le serveur contacte Instagram ou TikTok pour récupérer la vidéo. Le MP4 y est
                conservé temporairement pendant 30 minutes, puis supprimé. Aucun historique n’est
                enregistré dans votre navigateur, et aucun outil publicitaire ou de mesure
                d’audience n’est intégré.
              </p>
            </details>
            <details>
              <summary>
                Et si le téléchargement ne fonctionne pas ?<ChevronDown size={17} />
              </summary>
              <p>
                Vérifiez que le lien pointe vers une vidéo publique. Instagram et TikTok peuvent
                limiter l’accès, demander une connexion ou changer leur fonctionnement. Réessayez
                plus tard et mettez le moteur à jour avec « npm run setup:engine ». Limites : 200
                Mo, 20 minutes, et 3 minutes de préparation.
              </p>
            </details>
            <details>
              <summary>
                Est-ce que le filigrane est retiré ?<ChevronDown size={17} />
              </summary>
              <p>
                Non : l’application enregistre la vidéo disponible sur la plateforme. Elle ne
                garantit pas l’absence de filigrane et ne retire pas les crédits du créateur.
              </p>
            </details>
          </div>
        </section>
      </main>

      <footer className="site-footer page-width">
        <Brand footer />
        <span>Moins de bruit. Plus de bonnes trouvailles.</span>
        <a href="#telecharger">
          On garde quoi aujourd’hui ? <ArrowDown size={14} />
        </a>
      </footer>
    </>
  );
}
