import { localDb, filters, deleteItem } from './services.js';
import { currencyFormatter, numberFormatter, formatDate, dateToInput } from './utils.js';

// Elementos Globais UI
const loadingOverlay = document.getElementById('loading-overlay');
const loadingSpinner = document.getElementById('loading-spinner');

export function showLoading(isSaving = false) {
    const submitButtons = document.querySelectorAll('form button[type="submit"]');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    if (loadingSpinner) loadingSpinner.textContent = isSaving ? 'Salvando...' : 'Carregando dados...';
    if (isSaving) submitButtons.forEach(btn => btn.disabled = true);
}

export function hideLoading() {
    const submitButtons = document.querySelectorAll('form button[type="submit"]');
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
    submitButtons.forEach(btn => btn.disabled = false);
}

export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `p-4 rounded-lg shadow-lg text-white toast ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 4500);
}

// Modais
export function openModal(modalId) {
    const m = document.getElementById(modalId);
    if (!m) return;
    m.classList.remove('hidden', 'opacity-0');
    m.classList.add('flex');
    requestAnimationFrame(() => {
        m.classList.remove('opacity-0');
        m.querySelector('.modal-content')?.classList.remove('scale-95');
        const focusable = m.querySelector('input,select,textarea,button');
        focusable?.focus();
    });
    // Lógica específica de reset de forms ao abrir
    const today = dateToInput({ toDate: () => new Date() }); // Mock simples
    if (modalId === 'modal-nova-producao') {
        const form = document.getElementById('form-nova-producao');
        if (form) form.reset();
        const list = document.getElementById('producao-insumos-list');
        if (list) list.innerHTML = '';
        const dataEl = document.getElementById('producao-data');
        if (dataEl) dataEl.value = today;
    }
    if (modalId === 'modal-nova-transacao') {
        document.getElementById('modal-transacao-title').textContent = 'Adicionar Transação Manual';
        const form = document.getElementById('form-nova-transacao');
        if (form) form.reset();
        document.getElementById('transacao-id').value = '';
        document.getElementById('transacao-data').value = today;
    }
    if (modalId === 'modal-nova-venda') {
        // Limpa ID para garantir que é nova venda
        const idInput = document.getElementById('venda-id');
        if (idInput) idInput.value = '';
        const form = document.getElementById('form-nova-venda');
        if (form) form.reset();
        document.getElementById('venda-data').value = today;
    }
}

export function closeModal(modalId) {
    const m = document.getElementById(modalId);
    if (!m) return;
    m.classList.add('opacity-0');
    m.querySelector('.modal-content')?.classList.add('scale-95');
    setTimeout(() => {
        m.classList.add('hidden');
        m.classList.remove('flex');
        if (modalId === 'modal-nova-compra') {
            document.getElementById('form-nova-compra').reset();
            const commonFields = document.getElementById('common-fields');
            if (commonFields) commonFields.classList.add('hidden');
            const dynamicFields = document.getElementById('dynamic-form-fields');
            if (dynamicFields) Array.from(dynamicFields.children).forEach(el => el.classList.add('hidden'));
        }
    }, 200);
}

// Modal de Exclusão (Importa deleteItem)
let itemToDelete = {};
export function openDeleteModal(itemId, type, name = '', financeiroId = null) {
    itemToDelete = { id: itemId, type, financeiroId };
    const msg = document.getElementById('delete-confirm-message');
    if (msg) msg.textContent = `Tem certeza que deseja excluir "${name || type}"? Esta ação não pode ser desfeita.`;

    const btn = document.getElementById('btn-confirmar-exclusao');
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', async () => {
        try {
            showLoading(true);
            await deleteItem(itemToDelete.id, itemToDelete.type, itemToDelete.financeiroId);
            showToast('Excluído com sucesso.');
            closeModal('modal-confirmar-exclusao');
        } catch (err) {
            console.error("Erro ao excluir:", err);
            showToast(`Erro ao excluir: ${err.message}`, 'error');
        } finally { hideLoading(); }
    });
    openModal('modal-confirmar-exclusao');
}

export function openEditModal(id, type) {
    const listKey = type === 'producao' ? 'producao' : type + 's';
    const item = localDb[listKey].find(i => i.id === id);
    if (!item) return;

    if (type === 'producao') {
        document.getElementById('edit-producao-id').value = id;
        document.getElementById('edit-producao-produto-id').value = item.produtoId;
        document.getElementById('edit-producao-old-qtd').value = item.qtd || 0;
        document.getElementById('edit-producao-lote').textContent = item.lote;
        document.getElementById('edit-producao-data-entrega').value = dateToInput(item.dataEntrega);
        document.getElementById('edit-producao-status').value = item.status || 'Em Produção';
        document.getElementById('edit-producao-old-status').value = item.status || 'Em Produção';
        openModal('modal-editar-producao');
    } else if (type === 'produto') {
        document.getElementById('edit-produto-id').value = id;
        document.getElementById('edit-produto-sku').value = item.sku;
        document.getElementById('edit-produto-custo').value = item.custoUnitario;
        document.getElementById('edit-produto-estoque').value = item.qtdEstoque;
        document.getElementById('edit-produto-estoque-minimo').value = item.estoqueMinimo;
        openModal('modal-editar-produto');
    } else if (type === 'insumo') {
        document.getElementById('edit-insumo-id').value = id;
        document.getElementById('edit-insumo-nome').value = item.nome;
        document.getElementById('edit-insumo-unidade').value = item.unidade;
        document.getElementById('edit-insumo-custo').value = item.custo;
        document.getElementById('edit-insumo-estoque').value = item.qtdEstoque;
        document.getElementById('edit-insumo-estoque-minimo').value = item.estoqueMinimo;
        openModal('modal-editar-insumo');
    } else if (type === 'financeiro') {
        document.getElementById('modal-transacao-title').textContent = 'Editar Transação';
        document.getElementById('transacao-id').value = id;
        document.getElementById('transacao-data').value = dateToInput(item.createdAt);
        document.getElementById('transacao-descricao').value = item.descricao;
        document.getElementById('transacao-tipo').value = item.tipo;
        document.getElementById('transacao-categoria').value = item.categoria;
        document.getElementById('transacao-valor').value = item.valor;
        openModal('modal-nova-transacao');
    } else if (type === 'venda') {
        // NOVA LÓGICA PARA VENDA
        document.getElementById('venda-id').value = id; // Define o ID para edição
        document.getElementById('venda-data').value = dateToInput(item.createdAt);
        document.getElementById('venda-cliente').value = item.cliente;
        document.getElementById('venda-sku').value = item.produtoId;
        document.getElementById('venda-qtd').value = item.qtd;
        document.getElementById('venda-preco').value = item.precoUnitario || (item.receitaLiquida / item.qtd);
        document.getElementById('venda-status').value = item.status;
        openModal('modal-nova-venda');
    }
}

export function updateProductionCost() {
    const qtd = Number((document.getElementById('producao-qtd')?.value || '0').replace(',', '.'));
    const custoMaoDeObra = Number((document.getElementById('producao-mao-de-obra')?.value || '0').replace(',', '.'));
    let custoTotalInsumos = 0;
    const list = document.getElementById('producao-insumos-list');
    if (list) {
        list.querySelectorAll('li').forEach(item => {
            custoTotalInsumos += parseFloat(item.dataset.totalcost);
        });
    }
    const custoTotalLote = (custoMaoDeObra * (qtd || 1)) + custoTotalInsumos;
    const perPiece = qtd > 0 ? custoTotalLote / qtd : 0;

    const totalEl = document.getElementById('producao-custo-total');
    const perPecaEl = document.getElementById('producao-custo-peca');
    if (totalEl) totalEl.textContent = currencyFormatter.format(custoTotalLote);
    if (perPecaEl) perPecaEl.textContent = `${currencyFormatter.format(perPiece)} por peça`;
}

// Renderers
function applyFilters(data, type) {
    let filteredData = [...data];
    const search = filters[type]?.search;
    let startDate = filters[type]?.startDate;
    let endDate = filters[type]?.endDate;

    if (startDate && typeof startDate === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(startDate)) startDate = new Date(startDate + 'T00:00:00');
    if (endDate && typeof endDate === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(endDate)) endDate = new Date(endDate + 'T23:59:59');

    if (type === 'insumos') {
        if (filters.insumos.fornecedor) filteredData = filteredData.filter(i => i.fornecedor === filters.insumos.fornecedor);
    } else {
        if (search) {
            const terms = search.toLowerCase().split(' ');
            const searchKeys = type === 'vendas' ? ['cliente', 'sku'] : ['descricao', 'categoria'];
            filteredData = filteredData.filter(item => {
                const itemText = searchKeys.map(key => item[key] || '').join(' ').toLowerCase();
                return terms.every(term => itemText.includes(term));
            });
        }
        if (startDate) filteredData = filteredData.filter(item => item.createdAt && item.createdAt.toDate() >= startDate);
        if (endDate) filteredData = filteredData.filter(item => item.createdAt && item.createdAt.toDate() <= endDate);
    }
    return filteredData;
}

export function renderEmptyState(containerId, title, text) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="text-center p-8 bg-gray-50 rounded-lg empty-state">
            <h3 class="text-xl font-semibold text-gray-800">${title}</h3>
            <p class="text-gray-500 mt-2 mb-4 max-w-md mx-auto">${text}</p>
        </div>`;
}

export function renderVendas() {
    const filtered = applyFilters(localDb.vendas, 'vendas');
    const container = document.getElementById('vendas-content');
    if (!container) return;

    if (localDb.vendas.length === 0) {
        renderEmptyState('vendas-content', 'Nenhuma Venda', 'Registre sua primeira venda.');
        document.getElementById('vendas-analytics')?.classList.add('hidden');
        return;
    }
    document.getElementById('vendas-analytics')?.classList.remove('hidden');

    // Analytics Simples
    const totalVendido = filtered.reduce((acc, v) => acc + (v.receitaLiquida || 0), 0);
    document.getElementById('vendas-kpi-total').textContent = currencyFormatter.format(totalVendido);
    document.getElementById('vendas-kpi-pedidos').textContent = filtered.length;

    container.innerHTML = `
    <div class="overflow-x-auto">
        <table id="vendas-table-container" class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Data</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Cliente</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Produto</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Qtd</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Receita</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Ações</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${filtered.map(v => `<tr>
                    <td class="px-4 py-3">${formatDate(v.createdAt)}</td>
                    <td class="px-4 py-3">${v.cliente}</td>
                    <td class="px-4 py-3">${v.sku}</td>
                    <td class="px-4 py-3">${numberFormatter.format(v.qtd)}</td>
                    <td class="px-4 py-3">${currencyFormatter.format(v.receitaLiquida)}</td>
                    <td class="px-4 py-3 text-sm font-medium">
                        <button onclick="window.openEditModal('${v.id}', 'venda')" class="text-indigo-600 hover:text-indigo-900">Editar</button>
                        <button onclick="window.openDeleteModal('${v.id}', 'venda', 'Venda ${v.cliente}', '${v.financeiroId}')" class="text-red-600 ml-2">Excluir</button>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

export function renderEstoque() {
    const container = document.getElementById('estoque-content');
    if (!container) return;
    if (localDb.produtos.length === 0) {
        renderEmptyState('estoque-content', 'Nenhum Produto', 'Cadastre produtos.');
        return;
    }
    container.innerHTML = `
     <div class="overflow-x-auto">
        <table id="estoque-table-container" class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
               <tr><th class="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Qtd</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Custo</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Ações</th></tr>
           </thead>
            <tbody class="bg-white divide-y divide-gray-200">
            ${localDb.produtos.map(p => `<tr>
                <td class="px-4 py-3 font-medium">${p.sku}</td>
                <td class="px-4 py-3">${numberFormatter.format(p.qtdEstoque || 0)}</td>
                <td class="px-4 py-3">${currencyFormatter.format(p.custoUnitario || 0)}</td>
                <td class="px-4 py-3 text-sm">
                    <button onclick="window.openEditModal('${p.id}', 'produto')" class="text-indigo-600 hover:text-indigo-900">Editar</button>
                    <button onclick="window.openDeleteModal('${p.id}', 'produto', '${p.sku}')" class="text-red-600 ml-2">Excluir</button>
                </td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

export function renderInsumos() {
    const filtered = applyFilters(localDb.insumos, 'insumos');
    const container = document.getElementById('insumos-content');
    if (!container) return;
    if (localDb.insumos.length === 0) {
        renderEmptyState('insumos-content', 'Nenhuma Matéria-Prima', 'Cadastre insumos.');
        return;
    }
    container.innerHTML = `
    <div class="overflow-x-auto">
        <table id="insumos-table-container" class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr><th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Nome</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Qtd</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Custo</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Ações</th></tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
            ${filtered.map(i => `<tr>
                <td class="px-4 py-3">${i.nome}</td>
                <td class="px-4 py-3">${numberFormatter.format(i.qtdEstoque || 0)} ${i.unidade || ''}</td>
                <td class="px-4 py-3">${currencyFormatter.format(i.custo || 0)}</td>
                <td class="px-4 py-3 text-sm">
                    <button onclick="window.openEditModal('${i.id}', 'insumo')" class="text-indigo-600 hover:text-indigo-900">Editar</button>
                    <button onclick="window.openDeleteModal('${i.id}', 'insumo', '${i.nome.replace(/"/g, '&quot;')}', '${i.financeiroId}')" class="text-red-600 ml-2">Excluir</button>
                </td>
                </tr>`).join('')}
            </tbody>
        </table>
     </div>`;
}

export function renderProducao() {
    const container = document.getElementById('producao-content');
    if (!container) return;
    if (localDb.producao.length === 0) {
        renderEmptyState('producao-content', 'Nenhum Lote', 'Inicie um lote.');
        return;
    }
    container.innerHTML = `
    <div class="overflow-x-auto">
        <table id="producao-table-container" class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Lote</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Produto</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Qtd</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Ações</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
            ${localDb.producao.map(p => `<tr>
                <td class="px-4 py-3">${p.lote}</td>
                <td class="px-4 py-3">${p.sku}</td>
                <td class="px-4 py-3">${numberFormatter.format(p.qtd)}</td>
                <td class="px-4 py-3">
                    <select onchange="window.mudarStatusProducao('${p.id}', '${p.status}', this.value)" class="border rounded p-1 text-sm font-medium cursor-pointer ${p.status === 'Recebido' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                        <option value="Em Produção" ${p.status === 'Em Produção' ? 'selected' : ''}>Em Produção</option>
                        <option value="Recebido" ${p.status === 'Recebido' ? 'selected' : ''}>Recebido</option>
                    </select>
                </td>
                <td class="px-4 py-3 text-sm">
                    <button onclick="window.openEditModal('${p.id}', 'producao')" class="text-indigo-600 hover:text-indigo-900">Editar</button>
                    <button onclick="window.openDeleteModal('${p.id}', 'producao', 'Lote ${p.lote}', '${p.financeiroId}')" class="text-red-600 ml-2">Excluir</button>
                </td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

export function renderFinanceiro() {
    const filtered = applyFilters(localDb.financeiro, 'financeiro');
    const container = document.getElementById('financeiro-content');
    if (!container) return;

    // Totais
    const totalEntradas = localDb.financeiro.filter(t => t.tipo === 'entrada').reduce((s, t) => s + t.valor, 0);
    const totalSaidas = localDb.financeiro.filter(t => t.tipo === 'saida').reduce((s, t) => s + t.valor, 0);
    document.getElementById('financeiro-entradas').textContent = currencyFormatter.format(totalEntradas);
    document.getElementById('financeiro-saidas').textContent = currencyFormatter.format(totalSaidas);
    document.getElementById('financeiro-saldo').textContent = currencyFormatter.format(totalEntradas - totalSaidas);

    if (localDb.financeiro.length === 0) {
        renderEmptyState('financeiro-content', 'Sem transações', 'Registre movimentações.');
        return;
    }

    container.innerHTML = `
        <div class="overflow-x-auto">
            <table id="financeiro-table-container" class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr><th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Data</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Descrição</th><th class="px-4 py-2 text-right text-xs font-medium text-gray-500">Valor</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Ações</th></tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                ${filtered.map(t => `<tr>
                    <td class="px-4 py-3">${formatDate(t.createdAt)}</td>
                    <td class="px-4 py-3">${t.descricao}</td>
                    <td class="px-4 py-3 text-right font-medium ${t.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}">${t.tipo === 'saida' ? '-' : ''}${currencyFormatter.format(t.valor)}</td>
                    <td class="px-4 py-3 text-sm font-medium">
                        <button onclick="window.openEditModal('${t.id}', 'financeiro')" class="text-indigo-600 hover:text-indigo-900">Editar</button>
                        <button onclick="window.openDeleteModal('${t.id}', 'financeiro', '${t.descricao}')" class="text-red-600 ml-2">Excluir</button>
                    </td>
                </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

export function renderDashboard() {
    // Simplificado para o script - renderiza KPIs básicos
    // Requer Chart.js configurado no app.js ou aqui
    renderVendas(); // KPIs de vendas atualizam o dashboard parcialmente
    // A lógica completa de charts ficaria aqui, igual ao original
}

export function populateFormOptions() {
    const byId = (id) => document.getElementById(id);
    const insumos = localDb.insumos || [];
    const produtos = localDb.produtos || [];

    const fornecedores = [...new Set(insumos.map(i => i.fornecedor).filter(Boolean))];
    const filterEl = byId('insumo-filter-fornecedor');
    if (filterEl) {
        const val = filterEl.value;
        filterEl.innerHTML = `<option value="">Todos</option>${fornecedores.map(f => `<option value="${f}">${f}</option>`).join('')}`;
        filterEl.value = val;
    }
    // Datalists
    const fill = (id, arr) => { const dl = byId(id); if (dl) dl.innerHTML = arr.map(v => `<option value="${v}">`).join(''); };
    fill('estampas-list', [...new Set(insumos.filter(i => i.tipo === 'tecido' && i.modelo).map(i => i.modelo))]);
    fill('tipos-tecido-list', [...new Set(insumos.filter(i => i.tipo === 'tecido' && i.tecidoTipo).map(i => i.tecidoTipo))]);
    fill('fornecedores-list', fornecedores);
    fill('composicoes-linha-list', [...new Set(insumos.filter(i => i.tipo === 'linha' && i.composicao).map(i => i.composicao))]);
    fill('materiais-botoes-list', [...new Set(insumos.filter(i => i.tipo === 'botoes' && i.material).map(i => i.material))]);

    const insSel = byId('producao-insumo-select');
    if (insSel) insSel.innerHTML = `<option value="" disabled selected>Selecione...</option>${insumos.map(i => `<option value="${i.id}" data-un="${i.unidade || ''}">${i.nome} (${Number(i.qtdEstoque || 0)})</option>`).join('')}`;

    const pSel = byId('producao-sku');
    if (pSel) pSel.innerHTML = `<option value="" disabled selected>Selecione...</option>${produtos.map(p => `<option value="${p.id}">${p.sku}</option>`).join('')}`;

    const vSel = byId('venda-sku');
    if (vSel) vSel.innerHTML = `<option value="" disabled selected>Selecione...</option>${produtos.map(p => `<option value="${p.id}">${p.sku}</option>`).join('')}`;
}

// Expor para window
window.openModal = openModal;
window.closeModal = closeModal;
window.openEditModal = openEditModal;
window.openDeleteModal = openDeleteModal;
window.updateProductionCost = updateProductionCost;
window.renderAll = () => {
    renderDashboard(); renderVendas(); renderEstoque(); renderInsumos(); renderProducao(); renderFinanceiro();
};