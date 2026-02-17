function navHTML(active) {
  const links = [
    { href: '/gallery', label: 'Gallery' },
    { href: '/posts', label: 'Posts' },
    { href: '/assets', label: 'Assets' },
    { href: '/admin', label: 'Admin' }
  ];
  const linkItems = links.map(l =>
    `<a href="${l.href}" class="${l.href === active ? 'text-white font-medium' : 'text-slate-300 hover:text-white'} transition-colors">${l.label}</a>`
  ).join('\n          ');
  return `<nav class="bg-slate-900 text-white shadow-lg">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <a href="/" class="text-xl font-bold tracking-tight">BMB Content Server</a>
        <div class="flex items-center gap-6">${linkItems}</div>
      </div>
    </div>
  </nav>`;
}

function postViewHTML(post, htmlContent) {
  const formattedDate = new Date(post.uploadDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} - BMB Content Server</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .prose img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1.5rem 0; }
    .prose h1 { font-size: 2rem; font-weight: 700; margin: 1.5rem 0 1rem; color: #0f172a; }
    .prose h2 { font-size: 1.5rem; font-weight: 600; margin: 1.25rem 0 0.75rem; color: #1e293b; }
    .prose h3 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem; color: #334155; }
    .prose p { margin: 0.75rem 0; line-height: 1.75; color: #475569; }
    .prose ul, .prose ol { margin: 0.75rem 0; padding-left: 1.5rem; color: #475569; }
    .prose li { margin: 0.25rem 0; }
    .prose a { color: #2563eb; text-decoration: underline; }
    .prose blockquote { border-left: 4px solid #e2e8f0; padding-left: 1rem; margin: 1rem 0; color: #64748b; font-style: italic; }
    .prose code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875rem; }
    .prose pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin: 1rem 0; }
    .prose pre code { background: none; padding: 0; }
  </style>
</head>
<body class="bg-slate-50 min-h-screen">
  ${navHTML('/posts')}
  <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <a href="/posts" class="inline-flex items-center text-blue-600 hover:text-blue-700 mb-8 group">
      <svg class="w-5 h-5 mr-2 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
      Back to Posts
    </a>
    <article class="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div class="p-8 sm:p-12">
        <h1 class="text-4xl font-bold text-slate-900 mb-4">${post.title}</h1>
        <div class="flex items-center text-slate-500 mb-8 pb-8 border-b border-slate-200">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          ${formattedDate}
        </div>
        <div class="prose">${htmlContent}</div>
      </div>
    </article>
  </main>
</body>
</html>`;
}

function notFoundHTML(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Not Found</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-50 min-h-screen">
  ${navHTML('')}
  <main class="max-w-4xl mx-auto px-4 py-24 text-center">
    <h1 class="text-6xl font-bold text-slate-300 mb-4">404</h1>
    <p class="text-xl text-slate-600 mb-8">${message}</p>
    <a href="/" class="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors">Go Home</a>
  </main>
</body></html>`;
}

module.exports = { navHTML, postViewHTML, notFoundHTML };
