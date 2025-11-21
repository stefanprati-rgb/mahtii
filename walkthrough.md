# Walkthrough: Refatoração Modular JavaScript

## Resumo das Mudanças
O código JavaScript monolítico do `index.html` (1200+ linhas) foi refatorado em uma arquitetura modular moderna:

- **`js/config.js`**: Configuração do Firebase.
- **`js/utils.js`**: Formatadores e funções de data.
- **`js/services.js`**: Lógica de dados pura (Firestore), sem dependência de UI.
- **`js/ui.js`**: Lógica de interface (Renderização, Modais, Toasts).
- **`js/app.js`**: Orquestrador que conecta tudo.
- **`css/styles.css`**: Estilos extraídos.

## Como Testar

Recomenda-se rodar a aplicação em um servidor local (ex: `firebase serve` ou `npx serve public`) para garantir que os Módulos ES6 funcionem corretamente (alguns navegadores bloqueiam módulos via `file://`).

### 1. Teste de Carregamento Inicial
- Abra o console do navegador (F12).
- Recarregue a página.
- **Verifique**:
    - [ ] Sem erros vermelhos no console.
    - [ ] Dados do Dashboard carregam corretamente (KPIs).
    - [ ] Tabelas (Vendas, Estoque, etc.) mostram dados.

### 2. Teste de Navegação
- Clique nos links da Sidebar (Vendas, Estoque, Produção, etc.).
- **Verifique**:
    - [ ] A transição entre abas ocorre suavemente.
    - [ ] O conteúdo correto é exibido em cada aba.

### 3. Teste de Funcionalidades Críticas

#### A. Nova Compra (Agrupamento)
1. Vá em "Insumos" > "Nova Compra".
2. Registre uma compra de um insumo **já existente** (mesmo nome/tipo).
3. **Verifique**: O sistema deve atualizar o estoque e recalcular o custo médio, em vez de criar duplicata.

#### B. Nova Venda (Baixa de Estoque)
1. Vá em "Vendas" > "Nova Venda".
2. Venda um produto com estoque.
3. **Verifique**:
    - O estoque do produto deve diminuir.
    - O financeiro deve registrar a entrada.

#### C. Produção (Consumo de Insumos)
1. Vá em "Produção" > "Novo Lote".
2. Crie um lote usando insumos.
3. **Verifique**: O estoque dos insumos deve ser descontado.

#### D. Exclusão com Estorno (Crítico)
1. Exclua a Venda ou Produção criada acima.
2. **Verifique**:
    - **Venda**: O estoque do produto deve voltar ao original.
    - **Produção**: O estoque dos insumos deve voltar ao original.

## Arquitetura
O fluxo de dados agora segue o padrão:
`UI (Evento)` -> `App (Orquestrador)` -> `Service (Dados)` -> `App` -> `UI (Atualização)`

Isso evita dependências circulares e torna o código mais fácil de manter.
