import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export class ProxyServer {
  private server: http.Server | null = null;
  private targetUrl: string = '';
  private port: number = 0;

  // Inspector script to inject into HTML pages
  private readonly inspectorScript = `
<script>
(function() {
  let inspectEnabled = false;
  let currentHighlight = null;

  const style = document.createElement('style');
  style.textContent = \`
    .__inspector-highlight__ {
      outline: 2px solid #007acc !important;
      outline-offset: 2px !important;
      background-color: rgba(0, 122, 204, 0.1) !important;
      cursor: crosshair !important;
    }
  \`;

  function handleMouseOver(e) {
    if (!inspectEnabled) return;
    e.stopPropagation();

    if (currentHighlight && currentHighlight !== e.target) {
      currentHighlight.classList.remove('__inspector-highlight__');
    }

    const el = e.target;
    if (el && el !== document.body && el !== document.documentElement) {
      el.classList.add('__inspector-highlight__');
      currentHighlight = el;
    }
  }

  function handleMouseOut(e) {
    if (!inspectEnabled) return;
    const el = e.target;
    if (el && el.classList) {
      el.classList.remove('__inspector-highlight__');
    }
  }

  function handleClick(e) {
    if (!inspectEnabled) return;
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    if (!el || el === document.body || el === document.documentElement) return;

    const styles = window.getComputedStyle(el);
    const elementData = {
      tagName: el.tagName.toLowerCase(),
      id: el.id || null,
      classList: Array.from(el.classList).filter(c => c !== '__inspector-highlight__'),
      outerHTML: cleanHTML(el.outerHTML, 2000),
      textContent: truncate(el.textContent, 200),
      computedStyles: {
        display: styles.display,
        position: styles.position,
        width: styles.width,
        height: styles.height,
        padding: styles.padding,
        margin: styles.margin,
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        fontSize: styles.fontSize,
        fontFamily: styles.fontFamily,
        borderRadius: styles.borderRadius,
        border: styles.border
      }
    };

    // Flash green to confirm
    el.style.outline = '3px solid #4caf50';
    setTimeout(() => {
      el.style.outline = '';
      if (inspectEnabled) el.classList.add('__inspector-highlight__');
    }, 200);

    // Send to parent
    window.parent.postMessage({ type: 'elementSelected', data: elementData }, '*');
  }

  function cleanHTML(html, maxLen) {
    html = html.replace(/__inspector-highlight__/g, '').replace(/class="\\s*"/g, '');
    return html.length > maxLen ? html.substring(0, maxLen) + '...' : html;
  }

  function truncate(text, maxLen) {
    if (!text) return null;
    text = text.trim().replace(/\\s+/g, ' ');
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
  }

  function enable() {
    if (inspectEnabled) return;
    document.head.appendChild(style);
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    inspectEnabled = true;
  }

  function disable() {
    if (!inspectEnabled) return;
    if (currentHighlight) {
      currentHighlight.classList.remove('__inspector-highlight__');
      currentHighlight = null;
    }
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    if (style.parentNode) style.parentNode.removeChild(style);
    inspectEnabled = false;
  }

  // Listen for messages from parent webview
  window.addEventListener('message', (e) => {
    if (e.data.type === 'enableInspect') enable();
    if (e.data.type === 'disableInspect') disable();
  });

  // Notify parent that inspector is ready
  window.parent.postMessage({ type: 'inspectorReady' }, '*');
})();
</script>
`;

  async start(targetUrl: string): Promise<number> {
    this.targetUrl = targetUrl;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
          console.log(`[Proxy] Started on port ${this.port}, proxying to ${this.targetUrl}`);
          resolve(this.port);
        } else {
          reject(new Error('Failed to get proxy port'));
        }
      });

      this.server.on('error', reject);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = 0;
      console.log('[Proxy] Stopped');
    }
  }

  getUrl(): string {
    return this.port ? `http://localhost:${this.port}` : '';
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const targetUrlObj = new URL(this.targetUrl);
    const requestUrl = req.url || '/';
    const isHttps = targetUrlObj.protocol === 'https:';

    const options: http.RequestOptions | https.RequestOptions = {
      hostname: targetUrlObj.hostname,
      port: targetUrlObj.port || (isHttps ? 443 : 80),
      path: requestUrl,
      method: req.method,
      headers: {
        ...req.headers,
        host: targetUrlObj.host
      },
      // For HTTPS: accept self-signed certs (common in dev servers)
      ...(isHttps && { rejectUnauthorized: false })
    };

    // Use https or http based on target protocol
    const requestFn = isHttps ? https.request : http.request;
    const proxyReq = requestFn(options, (proxyRes) => {
      const contentType = proxyRes.headers['content-type'] || '';
      const isHtml = contentType.includes('text/html');

      if (isHtml) {
        // Collect HTML response and inject script
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          let html = Buffer.concat(chunks).toString('utf8');

          // Inject inspector script before </body> or at end
          if (html.includes('</body>')) {
            html = html.replace('</body>', this.inspectorScript + '</body>');
          } else {
            html += this.inspectorScript;
          }

          // Update content-length
          const headers = { ...proxyRes.headers };
          delete headers['content-length'];
          delete headers['content-encoding']; // Remove compression since we modified content

          res.writeHead(proxyRes.statusCode || 200, headers);
          res.end(html);
        });
      } else {
        // Pass through non-HTML responses
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error('[Proxy] Request error:', err);
      res.writeHead(502);
      res.end('Proxy error');
    });

    req.pipe(proxyReq);
  }
}
