import * as vscode from 'vscode';
import { PreviewPanel, SelectedElement } from '../preview/PreviewPanel';

const ELEMENT_PARTICIPANT_ID = 'designerMode.element';

export function registerElementParticipant(context: vscode.ExtensionContext) {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    const element = PreviewPanel.selectedElement;

    if (!element) {
      stream.markdown('No element selected. Use the **Inspect** button in the preview panel to select an element first.');
      return { metadata: { command: 'noElement' } };
    }

    // Build context about the selected element
    const elementContext = formatElementContext(element);

    // Provide the element context to the chat
    stream.markdown('**Selected Element:**\n');
    stream.markdown(elementContext);
    stream.markdown('\n\n---\n\n');

    // If the user provided a prompt, include it
    if (request.prompt) {
      stream.markdown(`**Your request:** ${request.prompt}\n\n`);
      stream.markdown('I\'ve provided the element context above. You can now ask Copilot to help with this element by including the context in your conversation.');
    }

    return { metadata: { command: 'elementProvided' } };
  };

  const participant = vscode.chat.createChatParticipant(ELEMENT_PARTICIPANT_ID, handler);
  participant.iconPath = new vscode.ThemeIcon('inspect');

  context.subscriptions.push(participant);
}

function formatElementContext(element: SelectedElement): string {
  const parts: string[] = [];

  // Basic info
  if (element.tagName) {
    let selector = element.tagName;
    if (element.id) selector += `#${element.id}`;
    if (element.classList.length > 0) selector += `.${element.classList.join('.')}`;
    parts.push(`**Element:** \`${selector}\``);
  } else {
    parts.push(`**Position:** (${element.x}, ${element.y})`);
  }

  // HTML
  if (element.outerHTML) {
    parts.push('\n**HTML:**');
    parts.push('```html');
    parts.push(element.outerHTML);
    parts.push('```');
  }

  // Text content
  if (element.textContent) {
    parts.push(`\n**Text content:** "${element.textContent}"`);
  }

  // Computed styles
  if (element.computedStyles) {
    parts.push('\n**Computed Styles:**');
    parts.push('```css');
    for (const [prop, value] of Object.entries(element.computedStyles)) {
      if (value && value !== 'initial' && value !== 'none' && value !== 'normal') {
        parts.push(`${camelToKebab(prop)}: ${value};`);
      }
    }
    parts.push('```');
  }

  return parts.join('\n');
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
