const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

class PDFGenerator {
  static async generatePDF(title, content, filePath, isTranscript = false) {
    return new Promise(async (resolve, reject) => {
      try {
        // Convert markdown to HTML with beautiful styling
        const htmlContent = this.createHTMLContent(title, content, isTranscript);
        
        // Create a hidden window for PDF generation
        const pdfWindow = new BrowserWindow({
          show: false,
          width: 800,
          height: 600,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          }
        });

        // Load the HTML content
        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
        
        // Wait a bit for content to render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Generate PDF
        const pdfData = await pdfWindow.webContents.printToPDF({
          marginsType: 0,
          pageSize: 'A4',
          printBackground: true,
          printSelectionOnly: false,
          landscape: false
        });
        
        // Save the PDF
        fs.writeFileSync(filePath, pdfData);
        
        // Close the hidden window
        pdfWindow.destroy();
        
        resolve(filePath);
      } catch (error) {
        reject(error);
      }
    });
  }

  static createHTMLContent(title, content, isTranscript) {
    // Convert markdown to HTML
    const htmlBody = this.convertMarkdownToHTML(content);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #2c3e50;
            background: white;
          }
          
          .header {
            background: linear-gradient(135deg, #7C3AED 0%, #9333EA 100%);
            color: white;
            padding: 40px;
            text-align: center;
            margin-bottom: 40px;
          }
          
          .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
            font-weight: 600;
            color: white !important;
          }
          
          .header .meta {
            font-size: 14px;
            opacity: 0.9;
            color: white !important;
          }
          
          .header .type {
            display: inline-block;
            background: rgba(255, 255, 255, 0.2);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            margin-top: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: white !important;
          }
          
          .content {
            padding: 0 40px 40px 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          
          h1 {
            color: #7C3AED;
            font-size: 24px;
            margin: 30px 0 15px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #E9D5FF;
          }
          
          h2 {
            color: #6D28D9;
            font-size: 20px;
            margin: 25px 0 12px 0;
          }
          
          h3 {
            color: #5B21B6;
            font-size: 18px;
            margin: 20px 0 10px 0;
          }
          
          p {
            margin: 12px 0;
            text-align: justify;
          }
          
          ul, ol {
            margin: 12px 0;
            padding-left: 30px;
          }
          
          li {
            margin: 6px 0;
          }
          
          strong {
            color: #1e293b;
            font-weight: 600;
          }
          
          em {
            font-style: italic;
            color: #475569;
          }
          
          blockquote {
            border-left: 4px solid #7C3AED;
            padding-left: 20px;
            margin: 20px 0;
            color: #64748b;
            font-style: italic;
          }
          
          code {
            background: #F3E8FF;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
          }
          
          pre {
            background: #F3E8FF;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            margin: 15px 0;
          }
          
          pre code {
            background: none;
            padding: 0;
          }
          
          hr {
            border: none;
            border-top: 1px solid #E9D5FF;
            margin: 25px 0;
          }
          
          .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #E9D5FF;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <div class="meta">${new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</div>
          <div class="type">${isTranscript ? 'Transcript' : 'Summary'}</div>
        </div>
        <div class="content">
          ${htmlBody}
          <div class="footer">
            Generated by Muesli Note Taker
          </div>
        </div>
      </body>
      </html>
    `;
  }

  static convertMarkdownToHTML(markdown) {
    if (!markdown) return '<p>No content available</p>';
    
    // Escape HTML first
    let html = markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Convert markdown to HTML
    html = html
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Lists
      .replace(/^\* (.+)/gim, '<li>$1</li>')
      .replace(/^• (.+)/gim, '<li>$1</li>')
      .replace(/^- (.+)/gim, '<li>$1</li>')
      .replace(/^\d+\. (.+)/gim, '<li>$1</li>')
      // Line breaks
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      // Horizontal rules
      .replace(/^---$/gim, '<hr>')
      .replace(/^___$/gim, '<hr>')
      .replace(/^\*\*\*$/gim, '<hr>');
    
    // Wrap consecutive list items in ul tags
    html = html.replace(/(<li>.*<\/li>)(\s*<li>)/g, '$1$2');
    html = html.replace(/(<li>.*<\/li>)+/g, function(match) {
      return '<ul>' + match + '</ul>';
    });
    
    // Wrap in paragraph tags if not already wrapped
    if (!html.startsWith('<')) {
      html = '<p>' + html + '</p>';
    }
    
    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    
    return html;
  }
}

module.exports = PDFGenerator;
