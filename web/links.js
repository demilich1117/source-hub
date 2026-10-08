export function imageLink(asset, config, mode = 'raw') {
  const encoded = asset.path.split('/').map(encodeURIComponent).join('/');
  if (mode === 'local') return new URL(encoded, config.localBase).href;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository)) throw new Error('先填写 GitHub 仓库名称。');
  if (mode === 'pages') return new URL(encoded, config.pagesUrl.replace(/\/?$/, '/')).href;
  const ref = mode === 'pinned' ? config.commit : config.branch;
  if (!ref || (mode === 'pinned' && asset.committed === false)) throw new Error('这张图片还没有可用的固定提交链接，请先提交并推送。');
  return `https://raw.githubusercontent.com/${config.repository}/${encodeURIComponent(ref)}/${encoded}`;
}
export const cssLink = url => `url(${JSON.stringify(url)})`;
export const formatSize = n => n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;
