import { ArtExperience } from './app/ArtExperience';
import { CONFIG } from './config/constants';

const params = new URLSearchParams(location.search);

const app = new ArtExperience({
  debug: params.get('debug') === 'true' || params.get('debug') === '1',
  synthetic: params.has('synthetic'),
  audio: params.get('audio') === '1',
  model: params.get('model') ?? CONFIG.segmentation.defaultModel,
  maskIndex: params.has('maskIndex') ? Number(params.get('maskIndex')) : null,
  bodyMode: params.get('body') === 'silhouette' ? 'silhouette' : 'video',
});

void app.start();

window.addEventListener('pagehide', (e) => {
  // keep the piece alive across back/forward-cache; tear down only on real exit
  if (!e.persisted) app.dispose();
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});
