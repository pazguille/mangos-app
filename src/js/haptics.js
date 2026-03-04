import { WebHaptics } from 'https://cdn.jsdelivr.net/npm/web-haptics/+esm';

const haptics = new WebHaptics();

document.addEventListener('click', (eve) => {
  if (eve.target.tagName === 'A' || eve.target.tagName === 'BUTTON') {
    haptics.trigger();
  }
});

// document.getElementById('unifiedInputBtn').addEventListener('touchend', (eve) => {
//   requestIdleCallback(() => haptics.trigger());
// });
