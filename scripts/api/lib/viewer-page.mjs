// A single HTML file that shows the description in Swagger UI.
// The description is embedded, so the page opens straight from disk (no local server).

const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';

/** @param {object} spec */
export function renderViewerPage(spec) {
  // "<" is escaped so the embedded JSON can never close the script tag.
  const json = JSON.stringify(spec).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>XO Platform API</title>
<link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
<style>body { margin: 0; background: #fff; }</style>
</head>
<body>
<div id="api"></div>
<script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
<script>
  window.ui = SwaggerUIBundle({
    spec: ${json},
    dom_id: '#api',
    docExpansion: 'none',
    defaultModelsExpandDepth: -1,
    tryItOutEnabled: false,
  });
</script>
</body>
</html>
`;
}
