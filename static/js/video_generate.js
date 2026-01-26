(() => {
  const script = document.createElement('script');
  script.src = '/static/js/generate.js?v=20251214b';
  script.defer = true;
  document.head.appendChild(script);

  const postHeight = () => {
    if (window.parent === window) return;
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    window.parent.postMessage({ type: 'sora-generate-height', height, frameId: window.GENERATE_FRAME_ID || 'videoGenerateFrame' }, '*');
  };

  window.addEventListener('load', () => {
    postHeight();
    setInterval(postHeight, 500);
  });
})();
