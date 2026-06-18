const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const path = require('path');
const fs = require('fs');

// Serve o app de lista de compras
app.get('/', (req, res) => {
  const appPath = path.join(__dirname, 'lista-compras.html');
  if (fs.existsSync(appPath)) {
    res.sendFile(appPath);
  } else {
    res.json({ status: 'ok', service: 'NFC-e Proxy', version: '1.0.0' });
  }
});

// Health check
app.get('/status', (req, res) => {
  res.json({ status: 'ok', service: 'NFC-e Proxy', version: '1.0.0' });
});

// Consulta cupom fiscal pelo link do QR Code
app.get('/consulta', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Parâmetro "url" obrigatório' });
  }

  try {
    const decoded = decodeURIComponent(url);

    // Faz requisição ao portal SEFAZ simulando um navegador
    const response = await axios.get(decoded, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
      maxRedirects: 5,
    });

    const html = response.data;
    const items = parseNFCe(html);
    const info = parseInfoNFCe(html);

    if (items.length === 0) {
      return res.status(422).json({
        error: 'Nenhum produto encontrado. O portal pode estar fora do ar ou o formato mudou.',
        raw_length: html.length,
      });
    }

    res.json({ success: true, info, items });

  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({
      error: 'Erro ao consultar o cupom',
      detail: err.message,
    });
  }
});

// Parser genérico — cobre SP, RJ, MG, RS, PR, SC, BA, GO e outros
function parseNFCe(html) {
  const $ = cheerio.load(html);
  const items = [];

  // Tentativa 1: tabela de produtos (padrão mais comum — SP, RJ, MG)
  $('table').each((_, table) => {
    const headers = [];
    $(table).find('th').each((_, th) => headers.push($(th).text().trim().toLowerCase()));

    const hasProduct = headers.some(h => h.includes('produto') || h.includes('descrição') || h.includes('item'));
    if (!hasProduct) return;

    $(table).find('tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const name = $(cells[0]).text().trim() || $(cells[1]).text().trim();
      const qty = parseFloat($(cells).filter((_, c) => {
        const t = $(c).text();
        return /^\d+[,.]?\d*$/.test(t.trim()) && parseFloat(t.replace(',', '.')) < 1000;
      }).first().text().replace(',', '.')) || 1;

      const priceText = $(cells).last().text().trim().replace(/[R$\s]/g, '').replace(',', '.');
      const price = parseFloat(priceText) || null;

      if (name && name.length > 2 && !/código|qtd|valor|total|desc/i.test(name)) {
        items.push({ name: cleanName(name), qty, price });
      }
    });
  });

  if (items.length > 0) return items;

  // Tentativa 2: divs com classe de produto (RS, PR, SC)
  const selectors = [
    '.txtTit', '.item', '.produto', '#tabResult tr',
    '[class*="prod"]', '[class*="item"]', '[id*="prod"]'
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const text = $(el).text().trim();
      if (text.length < 3 || /total|subtotal|troco|desconto|cnpj|cpf|data/i.test(text)) return;

      const priceMatch = text.match(/R?\$?\s*([\d.,]+)\s*$/);
      const qtyMatch = text.match(/(\d+[,.]?\d*)\s*[xX×]\s*/);

      const name = text.replace(priceMatch?.[0] || '', '').replace(qtyMatch?.[0] || '', '').trim();
      const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null;
      const qty = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 1;

      if (name && name.length > 2) {
        items.push({ name: cleanName(name), qty, price });
      }
    });

    if (items.length > 0) break;
  }

  // Tentativa 3: busca por padrões de texto (fallback)
  if (items.length === 0) {
    const text = $('body').text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);

    lines.forEach(line => {
      const priceMatch = line.match(/(\d{1,3}[.,]\d{2})\s*$/);
      if (!priceMatch) return;
      if (/total|subtotal|troco|desconto|taxa|cnpj|cpf/i.test(line)) return;

      const name = line.replace(priceMatch[0], '').trim();
      const price = parseFloat(priceMatch[1].replace(',', '.'));

      if (name.length > 3 && name.length < 80) {
        items.push({ name: cleanName(name), qty: 1, price });
      }
    });
  }

  // Remove duplicatas
  const seen = new Set();
  return items.filter(item => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseInfoNFCe(html) {
  const $ = cheerio.load(html);
  const text = $('body').text();

  const cnpjMatch = text.match(/CNPJ[:\s]*([\d.\/\-]+)/i);
  const totalMatch = text.match(/(?:total|valor total)[:\s]*R?\$?\s*([\d.,]+)/i);
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
  const storeMatch = $('h1, h2, .nomeEmitente, .razaoSocial, [class*="emitente"]').first().text().trim();

  return {
    store: storeMatch || null,
    cnpj: cnpjMatch?.[1] || null,
    total: totalMatch ? parseFloat(totalMatch[1].replace(',', '.')) : null,
    date: dateMatch?.[1] || null,
  };
}

function cleanName(name) {
  return name
    .replace(/^\d+\s*[-–]\s*/, '')       // remove número inicial
    .replace(/\s{2,}/g, ' ')              // espaços duplos
    .replace(/[*|#@^~`]/g, '')            // caracteres estranhos
    .replace(/\b(un|kg|lt|ml|g|ct|cx|pc|pct|fd|fdo)\b\.?/gi, '') // unidades
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()); // capitaliza
}

app.listen(PORT, () => {
  console.log(`NFC-e Proxy rodando na porta ${PORT}`);
});
