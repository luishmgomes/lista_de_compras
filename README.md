# NFC-e Proxy

Servidor proxy para consultar cupons fiscais NFC-e nos portais SEFAZ estaduais e retornar os produtos em JSON.

## Como funciona

O QR Code impresso no cupom fiscal aponta para uma URL do portal SEFAZ do estado (ex: `https://www.nfce.fazenda.sp.gov.br/...`). Por restrições de CORS, o app no navegador não consegue acessar essa URL diretamente — este proxy faz a requisição no servidor e retorna os dados parseados.

## Endpoint

```
GET /consulta?url=<URL_DO_QR_CODE_ENCODED>
```

### Exemplo de resposta

```json
{
  "success": true,
  "info": {
    "store": "SUPERMERCADO EXEMPLO LTDA",
    "cnpj": "12.345.678/0001-90",
    "total": 87.45,
    "date": "15/06/2025"
  },
  "items": [
    { "name": "Leite Integral", "qty": 2, "price": 5.99 },
    { "name": "Pão de Forma", "qty": 1, "price": 8.50 },
    { "name": "Detergente Limão", "qty": 3, "price": 2.49 }
  ]
}
```

## Deploy gratuito no Render

1. Crie conta em [render.com](https://render.com)
2. Clique em **New → Web Service**
3. Conecte ao GitHub (faça upload destes arquivos em um repositório público ou privado)
4. Render detecta automaticamente o `render.yaml`
5. Clique em **Deploy**
6. Após o deploy, você terá uma URL como `https://nfce-proxy.onrender.com`

**Anote essa URL** — você vai colá-la nas configurações do app de lista de compras.

## Deploy gratuito no Railway

1. Crie conta em [railway.app](https://railway.app)
2. Clique em **New Project → Deploy from GitHub repo**
3. Selecione o repositório
4. Railway detecta Node.js automaticamente
5. Em **Settings → Domains**, gere um domínio público

## Rodar localmente

```bash
npm install
npm run dev
```

Acesse: `http://localhost:3000/consulta?url=https://URL_DO_CUPOM`

## Estados compatíveis

O parser tenta múltiplas estratégias para cobrir os diferentes layouts dos portais estaduais:

| Estado | Portal | Compatibilidade |
|--------|--------|----------------|
| SP | nfce.fazenda.sp.gov.br | ✅ Alta |
| RJ | nfce.fazenda.rj.gov.br | ✅ Alta |
| MG | nfce.fazenda.mg.gov.br | ✅ Alta |
| RS | dfe-portal.svrs.rs.gov.br | ✅ Alta |
| PR | nfce.sefa.pr.gov.br | ✅ Alta |
| SC | sat.sef.sc.gov.br | ✅ Alta |
| BA | nfe.sefaz.ba.gov.br | 🟡 Média |
| GO | nfe.sefaz.go.gov.br | 🟡 Média |
| Outros | Variado | 🟡 Média |

> Os portais SEFAZ podem mudar o layout sem aviso. Se algum estado parar de funcionar, abra uma issue.
