import { auth, initialAuthToken } from './config.js';
import { showToast, showLoading, hideLoading, renderVendas, renderEstoque, renderInsumos, renderProducao, renderFinanceiro, renderDashboard, populateFormOptions, openModal, closeModal, updateProductionCost } from './ui.js';
import { deleteItem, salvarCompra, salvarVenda, salvarProducao, salvarProduto, salvarTransacao, editarProduto, editarInsumo, editarProducao, initializeAppListeners, newlyCreatedProductSKU } from './services.js';
import { onAuthStateChanged, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { asNumber, dateToInput, parseInputDate } from './utils.js';
import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    showLoading();
    setupNavigation();
    setupModalClosers();
    wireForms();

    // Auth Listener
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Passamos o callback de renderização para o service
            initializeAppListeners(() => {
                // Chama renderAll e populateFormOptions sempre que dados chegarem
                window.renderAll();
                populateFormOptions(); // <--- GARANTE QUE OS SKUS ESTEJAM ATUALIZADOS
                hideLoading();
            });
        } else {
            try {
                if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
                else await signInAnonymously(auth);
            } catch (e) { console.error(e); hideLoading(); showToast('Erro auth', 'error'); }
        }
    });
});

// Função global para troca rápida de status
window.mudarStatusProducao = async (id, oldStatus, newStatus) => {
    if (oldStatus === newStatus) return;

    const confirmMsg = newStatus === 'Recebido'
        ? "Confirma o recebimento? Isso adicionará os produtos ao estoque."
        : "Deseja voltar para 'Em Produção'? Isso estornará o estoque de produtos acabados.";

    if (!confirm(confirmMsg)) {
        renderProducao(); // Re-renderiza para voltar o dropdown ao estado original visualmente
        return;
    }

    showLoading(true);
    try {
        // Se virar 'Recebido', define data de entrega como hoje. Se voltar, mantém ou nulo.
        const dataEntrega = newStatus === 'Recebido' ? new Date() : null;

        await editarProducao(id, {
            oldStatus,
            newStatus,
            dataEntrega
        });
        showToast(`Status atualizado para ${newStatus}`);
    } catch (err) {
        console.error(err);
        showToast(err.message, 'error');
        renderProducao(); // Reseta UI em caso de erro
    } finally {
        hideLoading();
    }
};

// Sobrescrevemos a função global openModal para adicionar a atualização de SKUs
const originalOpenModal = window.openModal; // Salva referência original se existir no UI.js
window.openModal = (modalId) => {
    // Chama a lógica visual original (importada do ui.js e exposta lá, ou re-implementada aqui se necessário)
    // Como importamos openModal do ui.js, vamos usá-la, mas precisamos garantir que o UI.js a exponha corretamente.
    // No ui.js atual, window.openModal = openModal. Então podemos chamar a versão importada.

    openModal(modalId); // Chama a função visual

    // Lógica EXTRA de negócio ao abrir modais específicos
    if (modalId === 'modal-nova-venda' || modalId === 'modal-nova-producao') {
        populateFormOptions(); // <--- FORÇA ATUALIZAÇÃO DA LISTA DE PRODUTOS
    }
};

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const tabPanels = document.querySelectorAll('main > section');
    const sidebar = document.getElementById('sidebar');
    const hamburger = document.getElementById('hamburger-btn');

    if (hamburger) hamburger.addEventListener('click', () => sidebar.classList.toggle('open'));

    function updateUI(targetId, targetLink) {
        navLinks.forEach(link => link.classList.toggle('active', link === targetLink));
        tabPanels.forEach(panel => panel.classList.toggle('hidden', panel.id !== targetId));
        sidebar.classList.remove('open');
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const id = e.currentTarget.getAttribute('href').substring(1);
            updateUI(id, e.currentTarget);
        });
    });
}

function setupModalClosers() {
    document.querySelectorAll('.modal-backdrop').forEach(m => {
        m.addEventListener('click', (e) => { if (e.target === m) closeModal(m.id); });
    });
}

function wireForms() {
    // 1. Nova Compra
    document.getElementById('form-nova-compra')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);
        try {
            const tipo = document.getElementById('insumo-tipo').value;
            const dados = {
                tipo,
                nome: tipo === 'tecido' ? document.getElementById('tecido-nome').value.trim() :
                    tipo === 'linha' ? document.getElementById('linha-nome').value.trim() :
                        document.getElementById('outros-nome').value.trim(),
                extra: {},
                qtdComprada: asNumber('insumo-qtd-comprada'),
                custoNovo: asNumber('insumo-custo', true),
                estoqueMinimo: asNumber('insumo-estoque-minimo', true),
                unidade: document.getElementById('insumo-unidade').value.trim(),
                sizes: document.getElementById('collection-sizes').value.split(',').map(s => s.trim())
            };

            if (tipo === 'tecido') {
                dados.extra = { modelo: dados.nome, tecidoTipo: document.getElementById('tecido-tipo').value, fornecedor: document.getElementById('tecido-fornecedor').value };
            } else if (tipo === 'linha') {
                dados.extra = { composicao: document.getElementById('linha-composicao').value, espessura: document.getElementById('linha-espessura').value, fornecedor: document.getElementById('linha-fornecedor').value };
            } else if (tipo === 'botoes') {
                dados.extra = { material: document.getElementById('botoes-material').value, tamanho: document.getElementById('botoes-tamanho').value, fornecedor: document.getElementById('botoes-fornecedor').value };
            } else if (tipo === 'entretela') {
                dados.extra = { entretelaTipo: document.getElementById('entretela-tipo').value, fornecedor: document.getElementById('entretela-fornecedor').value };
            }

            await salvarCompra(dados);
            showToast('Compra salva!');
            closeModal('modal-nova-compra');
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
    });

    // 2. Nova Venda (Atualizado para suportar edição)
    document.getElementById('form-nova-venda')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);
        try {
            const id = document.getElementById('venda-id').value; // Pega o ID oculto
            const dados = {
                id: id, // Passa o ID para o serviço
                produtoId: document.getElementById('venda-sku').value,
                qtdVendida: asNumber('venda-qtd'),
                precoVenda: asNumber('venda-preco'),
                cliente: document.getElementById('venda-cliente').value.trim(),
                status: document.getElementById('venda-status').value,
                createdAt: parseInputDate(document.getElementById('venda-data').value) || Timestamp.now()
            };
            await salvarVenda(dados);
            showToast(id ? 'Venda atualizada!' : 'Venda realizada!');
            closeModal('modal-nova-venda');
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
    });

    // 3. Nova Produção
    document.getElementById('form-nova-producao')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);
        try {
            const insumosUsados = Array.from(document.getElementById('producao-insumos-list').querySelectorAll('li')).map(li => ({
                id: li.dataset.id, qtd: parseFloat(li.dataset.qtd), custo: parseFloat(li.dataset.cost)
            }));
            const dados = {
                produtoId: document.getElementById('producao-sku').value,
                qtdProduzida: asNumber('producao-qtd'),
                maoDeObra: asNumber('producao-mao-de-obra', true),
                insumosUsados,
                status: document.getElementById('producao-status').value,
                loteNome: document.getElementById('producao-lote').value,
                createdAt: parseInputDate(document.getElementById('producao-data').value) || Timestamp.now(),
                dataEntrega: parseInputDate(document.getElementById('producao-data-entrega').value)
            };
            await salvarProducao(dados);
            showToast('Produção iniciada!');
            closeModal('modal-nova-producao');
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
    });

    // 4. Novo Produto
    document.getElementById('form-novo-produto')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);
        try {
            const dados = {
                sku: document.getElementById('produto-sku').value.trim(),
                custo: asNumber('produto-custo', true),
                estoque: asNumber('produto-estoque-inicial', true),
                minimo: asNumber('produto-estoque-minimo'),
                source: document.getElementById('produto-source').value
            };
            if (isNaN(dados.custo) || isNaN(dados.estoque) || isNaN(dados.minimo)) throw new Error("Valores inválidos.");

            await salvarProduto(dados);
            showToast('Produto cadastrado!');
            closeModal('modal-novo-produto');
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
    });

    // 5. Nova Transação
    document.getElementById('form-nova-transacao')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);
        try {
            const id = document.getElementById('transacao-id').value;
            const dados = {
                descricao: document.getElementById('transacao-descricao').value.trim(),
                tipo: document.getElementById('transacao-tipo').value,
                categoria: document.getElementById('transacao-categoria').value.trim(),
                valor: asNumber('transacao-valor'),
                createdAt: parseInputDate(document.getElementById('transacao-data').value) || Timestamp.now(),
                isAutomatic: false
            };
            if (isNaN(dados.valor)) throw new Error("Valor inválido.");

            await salvarTransacao(dados, id);
            showToast(id ? 'Transação atualizada!' : 'Transação salva!');
            closeModal('modal-nova-transacao');
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
    });

    // 6. Editar Produto (Agora permite alterar SKU)
    document.getElementById('form-editar-produto')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);
        try {
            const id = document.getElementById('edit-produto-id').value;
            const dados = {
                sku: document.getElementById('edit-produto-sku').value.trim(),
                custoUnitario: asNumber('edit-produto-custo', true),
                qtdEstoque: asNumber('edit-produto-estoque', true),
                estoqueMinimo: asNumber('edit-produto-estoque-minimo')
            };
            await editarProduto(id, dados);
            showToast('Produto atualizado!');
            closeModal('modal-editar-produto');
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
    });

    // 7. Editar Insumo (Agora permite alterar Nome)
    document.getElementById('form-editar-insumo')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);
        try {
            const id = document.getElementById('edit-insumo-id').value;
            const dados = {
                nome: document.getElementById('edit-insumo-nome').value.trim(),
                unidade: document.getElementById('edit-insumo-unidade').value,
                custo: asNumber('edit-insumo-custo', true),
                qtdEstoque: asNumber('edit-insumo-estoque', true),
                estoqueMinimo: asNumber('edit-insumo-estoque-minimo', true)
            };
            await editarInsumo(id, dados);
            showToast('Insumo atualizado!');
            closeModal('modal-editar-insumo');
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
    });

    // 8. Editar Produção
    document.getElementById('form-editar-producao')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading(true);
        try {
            const id = document.getElementById('edit-producao-id').value;
            const dados = {
                oldStatus: document.getElementById('edit-producao-old-status').value,
                newStatus: document.getElementById('edit-producao-status').value,
                dataEntrega: parseInputDate(document.getElementById('edit-producao-data-entrega').value)
            };
            await editarProducao(id, dados);
            showToast('Produção atualizada!');
            closeModal('modal-editar-producao');
        } catch (err) { showToast(err.message, 'error'); }
        finally { hideLoading(); }
    });

    // Add Insumo Button in Production Modal
    document.getElementById('btn-add-insumo-producao')?.addEventListener('click', () => {
        const sel = document.getElementById('producao-insumo-select');
        const qtdEl = document.getElementById('producao-insumo-qtd');
        const id = sel.value;
        const qtd = parseFloat(qtdEl.value);
        if (!id || !qtd) return;

        const opt = sel.options[sel.selectedIndex];
        // Adicionar à lista visual
        const li = document.createElement('li');
        li.dataset.id = id; li.dataset.qtd = qtd; li.dataset.cost = 0; // Teria que pegar custo do localDb
        li.dataset.totalcost = 0;
        li.innerHTML = `<span>${qtd}x ${opt.text}</span> <button onclick="this.parentElement.remove(); updateProductionCost()">X</button>`;
        document.getElementById('producao-insumos-list').appendChild(li);
        updateProductionCost();
    });
}