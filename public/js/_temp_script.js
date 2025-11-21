
        // --- IMPORTS E CONFIGURAÇÃO DO FIREBASE ---
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, collection, onSnapshot, runTransaction, query, Timestamp, serverTimestamp, orderBy, addDoc, writeBatch, updateDoc, deleteDoc, increment, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // --- CONFIGURAÇÃO GLOBAL ---
        const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const appId = rawAppId.replace(/\//g, '_');
        const firebaseConfig = {
            apiKey: "AIzaSyAQsBf1CZB5tWYWGBJPLGtuIzqgAbHCi4Y",
            authDomain: "mahtii-4e508.firebaseapp.com",
            projectId: "mahtii-4e508",
            storageBucket: "mahtii-4e508.appspot.com",
            messagingSenderId: "731819768757",
            appId: "1:731819768757:web:e27cb2ada52915f60877fc",
            measurementId: "G-V6431LNWVM"
        };
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        const mainContent = document.querySelector('main');
        // --- TOGGLE SIDEBAR (MOBILE) ---
        const sidebarEl = document.getElementById('sidebar');
        const hamburgerBtn = document.getElementById('hamburger-btn');
        if (hamburgerBtn && sidebarEl) {
            hamburgerBtn.addEventListener('click', () => {
                sidebarEl.classList.toggle('open');
            });
        }
        const loadingOverlay = document.getElementById('loading-overlay');

        if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
            loadingOverlay.classList.add('hidden');
            mainContent.innerHTML = `<div class="text-center p-8 card max-w-lg mx-auto"><h2 class="text-2xl font-bold text-red-600 mb-4">Erro de Configuração</h2><p class="text-gray-700">A configuração do Firebase está ausente ou incompleta.</p></div>`;
            document.querySelector('#sidebar').style.display = 'none';
            throw new Error("Firebase config is missing or invalid.");
        }

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);

        // --- ESTADO DA APLICAÇÃO ---
        let dbRefs = {};
        let initialDataLoaded = false;
        let itemToDelete = { id: null, type: null, financeiroId: null };
        let newlyCreatedProductSKU = null;
        const localDb = {
            produtos: [],
            vendas: [],
            insumos: [],
            producao: [],
            financeiro: []
        };
        const filters = {
            vendas: { search: '', startDate: null, endDate: null },
            financeiro: { search: '', startDate: null, endDate: null },
            insumos: { fornecedor: '' }
        };

        // --- FUNÇÕES UTILITÁRIAS ---
        const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
        const numberFormatter = new Intl.NumberFormat('pt-BR');
        const isValidDateString = (dateStr) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
        const parseInputDate = (dateStr) => {
            if (!dateStr || !isValidDateString(dateStr)) return null;
            const date = new Date(dateStr + 'T03:00:00Z'); // Evita problemas de timezone
            if (isNaN(date.getTime())) return null;
            return Timestamp.fromDate(date);
        };
        const formatDate = (timestamp) => {
            if (!timestamp?.toDate) return '—';
            return timestamp.toDate().toLocaleDateString('pt-BR');
        };
        const dateToInput = (timestamp) => {
            if (!timestamp?.toDate) return '';
            const d = timestamp.toDate();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // --- FUNÇÕES DE UI (LOADING, TOAST, MODAL) ---
        const loadingSpinner = document.getElementById('loading-spinner');
        function showLoading(isSaving = false) {
            const submitButtons = document.querySelectorAll('form button[type="submit"]');
            loadingOverlay.classList.remove('hidden');
            loadingSpinner.textContent = isSaving ? 'Salvando...' : 'Carregando dados...';
            if (isSaving) submitButtons.forEach(btn => btn.disabled = true);
        }
        function hideLoading() {
            const submitButtons = document.querySelectorAll('form button[type="submit"]');
            loadingOverlay.classList.add('hidden');
            submitButtons.forEach(btn => btn.disabled = false);
        }
        function showToast(message, type = 'success') {
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

        function openModal(modalId) {
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

            const today = dateToInput(Timestamp.now());
            if (modalId === 'modal-nova-producao') {
                const form = document.getElementById('form-nova-producao');
                form.reset();
                document.getElementById('producao-insumos-list').innerHTML = '';
                updateProductionCost();

                const loteEl = document.getElementById('producao-lote');
                const now = new Date();
                const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
                loteEl.value = `L-${stamp}`;

                document.getElementById('producao-data').value = today;
                document.getElementById('producao-data-entrega').value = today;
            }

            if (modalId === 'modal-nova-transacao') {
                document.getElementById('modal-transacao-title').textContent = 'Adicionar Transação Manual';
                document.getElementById('form-nova-transacao').reset();
                document.getElementById('transacao-id').value = '';
                document.getElementById('transacao-data').value = today;
            }

            if (modalId === 'modal-nova-venda') {
                document.getElementById('venda-data').value = today;
            }

            if (modalId === 'modal-nova-compra') {
                // Prepara o estado do formulário de compra
                updateInsumoForm();
                bindTecidoUnidadeRadios();
            }
        }
        window.openModal = openModal;

        window.closeModal = function closeModal(modalId) {
            const m = document.getElementById(modalId);
            if (!m) return;
            m.classList.add('opacity-0');
            m.querySelector('.modal-content')?.classList.add('scale-95');
            setTimeout(() => {
                m.classList.add('hidden');
                m.classList.remove('flex');
                if (modalId === 'modal-nova-compra') {
                    document.getElementById('form-nova-compra').reset();
                    document.getElementById('collection-fabric-container').classList.add('hidden');
                    document.getElementById('collection-generator').classList.add('hidden');
                    document.getElementById('common-fields').classList.add('hidden');
                    Object.values(document.getElementById('dynamic-form-fields').children).forEach(el => el.classList.add('hidden'));
                }
            }, 200);
        };

        function setupModalClosers() {
            document.querySelectorAll('.modal-backdrop').forEach(m => {
                m.addEventListener('click', (e) => { if (e.target === m) window.closeModal(m.id); });
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(m => window.closeModal(m.id));
                }
            });
        }

        // === Preferência de unidade para TECIDO (localStorage) ===
        const PREF_KEY_TECIDO_UNIDADE = 'mahtii_pref_unidade_tecido';

        function getPreferredTecidoUnit() {
            try {
                const v = localStorage.getItem(PREF_KEY_TECIDO_UNIDADE);
                return (v === 'metros' || v === 'un') ? v : null;
            } catch { return null; }
        }

        function setPreferredTecidoUnit(value) {
            try { localStorage.setItem(PREF_KEY_TECIDO_UNIDADE, value); } catch { }
        }

        // === Placeholders dinâmicos para custo e quantidade ===
        function updateCostAndQtyPlaceholders(unit) {
            const custoEl = document.getElementById('insumo-custo');              // "Custo/Unidade"
            const qtdEl = document.getElementById('insumo-qtd-comprada');       // "Qtd. Comprada"
            if (!custoEl || !qtdEl) return;

            if (unit === 'metros') {
                custoEl.placeholder = 'R$ por metro';
                qtdEl.placeholder = 'Qtd. em metros';
            } else if (unit === 'un') {
                custoEl.placeholder = 'R$ por unidade';
                qtdEl.placeholder = 'Qtd. em unidades';
            } else {
                // fallback padrão
                custoEl.placeholder = 'R$ por unidade/metro';
                qtdEl.placeholder = 'Qtd.';
            }
        }

        // === DINÂMICA DO FORM DE COMPRA (Insumo) ===
        function updateInsumoForm() {
            const tipo = document.getElementById('insumo-tipo')?.value;
            const commonFields = document.getElementById('common-fields');
            const commonUnidadeGroup = document.getElementById('common-unidade-group');
            const fieldsTecido = document.getElementById('fields-tecido');

            if (tipo) commonFields?.classList.remove('hidden');

            if (tipo === 'tecido') {
                fieldsTecido?.classList.remove('hidden');
                commonUnidadeGroup?.classList.add('hidden');

                const pref = getPreferredTecidoUnit();
                if (pref) {
                    const radio = document.querySelector(`input[name="tecido-unidade"][value="${pref}"]`);
                    if (radio) radio.checked = true;
                }

                const selected = document.querySelector('input[name="tecido-unidade"]:checked')?.value || 'metros';

                const unidadeInput = document.getElementById('insumo-unidade');
                if (unidadeInput) unidadeInput.value = selected;

                updateCostAndQtyPlaceholders(selected);

            } else {
                fieldsTecido?.classList.add('hidden');
                commonUnidadeGroup?.classList.remove('hidden');
                updateCostAndQtyPlaceholders(null);
            }
        }

        function bindTecidoUnidadeRadios() {
            const radios = document.querySelectorAll('input[name="tecido-unidade"]');
            radios.forEach(r => {
                r.addEventListener('change', () => {
                    const unidade = r.value; // 'metros' ou 'un'
                    const unidadeInput = document.getElementById('insumo-unidade');
                    if (unidadeInput) unidadeInput.value = unidade;
                    updateCostAndQtyPlaceholders(unidade);
                    setPreferredTecidoUnit(unidade);
                });
            });
        }

        // --- LÓGICA DE EXCLUSÃO (CORRIGIDA COM ESTORNO) ---
        async function deleteItem(id, type, financeiroId) {
            const map = { venda: 'vendas', produto: 'produtos', insumo: 'insumos', producao: 'producao', financeiro: 'financeiro' };
            const colKey = map[type];
            if (!colKey) throw new Error('Tipo inválido para exclusão.');

            // Usamos runTransaction para garantir leitura + escrita atômica (segurança dos dados)
            await runTransaction(db, async (transaction) => {
                const itemRef = doc(dbRefs[colKey], id);
                const itemDoc = await transaction.get(itemRef);

                if (!itemDoc.exists()) {
                    throw new Error("Item não encontrado. Talvez já tenha sido excluído.");
                }

                const data = itemDoc.data();

                // 1. LÓGICA DE ESTORNO PARA VENDAS
                // Se apagar uma venda, devolve a quantidade vendida para o estoque
                if (type === 'venda') {
                    if (data.produtoId && data.qtd) {
                        const produtoRef = doc(dbRefs.produtos, data.produtoId);
                        transaction.update(produtoRef, { qtdEstoque: increment(data.qtd) });
                    }
                }

                // 2. LÓGICA DE ESTORNO PARA PRODUÇÃO
                if (type === 'producao') {
                    // Devolve os insumos gastos para o estoque de Matéria-Prima
                    if (data.insumos && Array.isArray(data.insumos)) {
                        for (const item of data.insumos) {
                            const insumoRef = doc(dbRefs.insumos, item.id);
                            transaction.update(insumoRef, { qtdEstoque: increment(item.qtd) });
                        }
                    }
                    // Se o lote já foi recebido (produtos criados), removemos eles do estoque pois o lote foi cancelado/excluído
                    if (data.status === 'Recebido' && data.produtoId) {
                        const produtoRef = doc(dbRefs.produtos, data.produtoId);
                        transaction.update(produtoRef, { qtdEstoque: increment(-data.qtd) });
                    }
                }

                // Finalmente, apaga o registro principal e o financeiro vinculado
                transaction.delete(itemRef);

                if (financeiroId) {
                    const financeiroRef = doc(dbRefs.financeiro, financeiroId);
                    transaction.delete(financeiroRef);
                }
            });
        }

        function openDeleteModal(itemId, type, name = '', financeiroId = null) {
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
                    window.closeModal('modal-confirmar-exclusao');
                } catch (err) {
                    console.error("Erro ao excluir item: ", err);
                    showToast(`Erro ao excluir: ${err.message}`, 'error');
                } finally { hideLoading(); }
            });

            openModal('modal-confirmar-exclusao');
        }
        window.openDeleteModal = openDeleteModal;

        // --- INICIALIZAÇÃO E AUTENTICAÇÃO ---
        let listeners = [];
        function initializeAppListeners() {
            const collectionsToLoad = Object.keys(localDb);
            let loadedCount = 0;

            const checkAllLoaded = () => {
                loadedCount++;
                if (loadedCount >= collectionsToLoad.length) {
                    initialDataLoaded = true;
                    renderAll();
                    hideLoading();
                }
            };

            const basePath = `/artifacts/${appId}/public/data`;
            dbRefs = {
                produtos: collection(db, `${basePath}/produtos`),
                vendas: collection(db, `${basePath}/vendas`),
                insumos: collection(db, `${basePath}/insumos`),
                producao: collection(db, `${basePath}/producao`),
                financeiro: collection(db, `${basePath}/financeiro`),
            };

            function createListener(key) {
                const ref = dbRefs[key];
                const q = query(ref, orderBy('createdAt', 'desc'));
                const unsub = onSnapshot(q, (snapshot) => {
                    localDb[key] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    if (initialDataLoaded) {
                        renderAll();
                    } else {
                        checkAllLoaded();
                    }
                    if (key === 'produtos' || key === 'insumos') {
                        populateFormOptions();
                    }
                }, (err) => {
                    console.error(`Erro no listener ${key}:`, err);
                    showToast(`Erro ao carregar ${key}.`, 'error');
                    checkAllLoaded();
                });
                listeners.push(unsub);
            }

            Object.keys(dbRefs).forEach(createListener);
        }

        // --- NAVEGAÇÃO E LAYOUT ---
        function setupNavigation() {
            const navLinks = document.querySelectorAll('.nav-link');
            const tabPanels = document.querySelectorAll('main > section');
            const breadcrumbs = document.getElementById('breadcrumbs');
            const sidebar = document.getElementById('sidebar');

            function updateUI(targetId, targetLink) {
                navLinks.forEach(link => link.classList.toggle('active', link === targetLink));
                tabPanels.forEach(panel => panel.classList.toggle('hidden', panel.id !== targetId));
                const linkText = targetLink.textContent.trim();
                breadcrumbs.innerHTML = `<a href="#dashboard" class="hover:text-blue-600">Dashboard</a>${linkText !== 'Dashboard' ? ` / <span class="font-semibold">${linkText}</span>` : ''}`;
                sidebar.classList.remove('open');
            }

            navLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetPanelId = e.currentTarget.getAttribute('href').substring(1);
                    updateUI(targetPanelId, e.currentTarget);
                    window.location.hash = targetPanelId;
                });
            });

            const currentHash = window.location.hash.substring(1) || 'dashboard';
            const targetLink = document.querySelector(`.nav-link[href="#${currentHash}"]`);
            if (targetLink) updateUI(currentHash, targetLink);
        }

        // --- FUNÇÃO DE RENDERIZAÇÃO PRINCIPAL ---
        function renderAll() {
            if (!initialDataLoaded) return;
            renderDashboard();
            renderVendas();
            renderEstoque();
            renderInsumos();
            renderProducao();
            renderFinanceiro();
        }

        // --- RENDERIZAÇÃO DE ESTADO VAZIO (TUTORIAL) ---
        function renderEmptyState(containerId, title, text) {
            const container = document.getElementById(containerId);
            if (!container) return;
            let finalHtml = '';
            if (containerId === 'financeiro-content') {
                finalHtml += `<div class="p-4 mb-4 text-sm text-blue-800 rounded-lg bg-blue-50" role="alert">
                    <span class="font-medium">Dica:</span> Para começar, lance um "Ajuste de Saldo Inicial" (caso já exista caixa) para facilitar a organização financeira e evitar saldos negativos.
                </div>`;
            }
            finalHtml += `
                <div class="text-center p-8 bg-gray-50 rounded-lg empty-state">
                    <h3 class="text-xl font-semibold text-gray-800">${title}</h3>
                    <p class="text-gray-500 mt-2 mb-4 max-w-md mx-auto">${text}</p>
                     <p class="text-sm text-gray-500">Use o botão <span class="font-semibold text-gray-600">no cabeçalho desta seção</span> para adicionar o primeiro item.</p>
                </div>`;
            container.innerHTML = finalHtml;
        }

        // --- LÓGICA DE EXPORTAÇÃO ---
        const exportMappings = {
            'vendas': { tableId: 'vendas-table-container', fileName: 'Relatorio_Vendas' },
            'estoque': { tableId: 'estoque-table-container', fileName: 'Relatorio_Estoque' },
            'materiaprima': { tableId: 'insumos-table-container', fileName: 'Relatorio_Materia_Prima' },
            'producao': { tableId: 'producao-table-container', fileName: 'Relatorio_Producao' },
            'financeiro': { tableId: 'financeiro-table-container', fileName: 'Relatorio_Financeiro' }
        };

        function setupExportListeners() {
            const reportSelect = document.getElementById('report-select');
            if (!reportSelect) return;

            document.getElementById('export-csv-btn').addEventListener('click', () => {
                const selected = reportSelect.value;
                const mapping = exportMappings[selected];
                if (mapping) {
                    exportTableToCSV(mapping.tableId, mapping.fileName);
                } else {
                    showToast('Por favor, selecione um relatório válido.', 'error');
                }
            });

            document.getElementById('export-pdf-btn').addEventListener('click', () => {
                const selected = reportSelect.value;
                const mapping = exportMappings[selected];
                if (mapping) {
                    exportTableToPDF(mapping.tableId, mapping.fileName);
                } else {
                    showToast('Por favor, selecione um relatório válido.', 'error');
                }
            });
        }

        function exportTableToCSV(tableContainerId, filename) {
            const table = document.getElementById(tableContainerId);
            if (!table) { showToast("Tabela não encontrada.", 'error'); return; }
            let csv = [];
            const headers = Array.from(table.querySelectorAll('thead th')).slice(0, -1).map(h => `"${h.textContent.trim()}"`);
            csv.push(headers.join(','));

            table.querySelectorAll('tbody tr').forEach(row => {
                const rowData = Array.from(row.querySelectorAll('td')).slice(0, -1).map(d => `"${d.textContent.trim()}"`);
                csv.push(rowData.join(','));
            });

            const csvContent = "data:text/csv;charset=utf-8," + csv.join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        window.exportTableToCSV = exportTableToCSV;

        window.exportTableToPDF = function (tableContainerId, filename) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const table = document.getElementById(tableContainerId);
            if (!table) { showToast("Tabela não encontrada para exportação.", "error"); return; }
            const header = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent);
            const body = Array.from(table.querySelectorAll('tbody tr')).map(row =>
                Array.from(row.querySelectorAll('td')).slice(0, -1).map(td => td.textContent.trim())
            );

            if (body.length === 0 || (body.length === 1 && body[0].length === 1)) {
                showToast("Não há dados para exportar.", "error");
                return;
            }

            doc.autoTable({
                head: [header.slice(0, -1)],
                body: body,
                didDrawPage: (data) => doc.text(filename.replace(/_/g, ' '), data.settings.margin.left, 22),
                margin: { top: 30 }
            });

            doc.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
        }

        // --- SEÇÃO DASHBOARD ---
        let selectedMonth = null;
        function getMonthRange(yyyymm) {
            const now = new Date();
            const [y, m] = (yyyymm || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
            const start = new Date(y, m - 1, 1, 0, 0, 0);
            const end = new Date(y, m, 0, 23, 59, 59);
            const prevStart = new Date(y, m - 2, 1, 0, 0, 0);
            const prevEnd = new Date(y, m - 1, 0, 23, 59, 59);
            return { start, end, prevStart, prevEnd };
        }
        function inRangeTS(ts, start, end) {
            if (!ts?.toDate) return false;
            const d = ts.toDate();
            return d >= start && d <= end;
        }
        function formatDelta(el, curr, prev) {
            if (!isFinite(prev) || prev === 0) {
                el.textContent = '— vs. mês ant.';
                el.className = 'text-xs mt-1 text-gray-500';
                return;
            }
            const delta = (curr - prev) / prev;
            const pct = (delta * 100).toFixed(1) + '%';
            const arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '■');
            el.textContent = `${arrow} ${pct} vs. mês ant.`;
            el.className = `text-xs mt-1 ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`;
        }

        function renderDashboard() {
            const container = document.getElementById('dashboard-content');
            const isFirstTime = Object.values(localDb).every(arr => arr.length === 0);

            let html = '';
            if (isFirstTime) {
                html += `
                <div class="card p-6 bg-blue-50 border-l-4 border-blue-500 mb-8">
                    <h3 class="text-xl font-semibold text-blue-800">Bem-vindo ao MAHTIÍ ERP!</h3>
                    <p class="text-gray-600 mt-2">Este é seu painel de controle. Aqui você gerencia produção, estoque, vendas e financeiro de forma integrada.</p>
                    <p class="text-gray-600 mt-4 font-semibold">Dica para começar:</p>
                    <ul class="list-disc list-inside text-gray-600">
                        <li>Comece cadastrando sua <a href="#materiaprima" class="text-blue-600 hover:underline">matéria-prima</a>.</li>
                        <li>Depois, inicie um <a href="#producao" class="text-blue-600 hover:underline">lote de produção</a>. O sistema cuidará dos custos para você!</li>
                    </ul>
                     <p class="text-gray-500 mt-4 text-sm">Clique nos ícones 🛈 ao longo do sistema para obter explicações detalhadas em cada etapa.</p>
                </div>
                `;
            }
            html += `
                <div class="card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-8">
                      <div class="flex-1">
                        <h2 class="text-xl font-semibold">Visão Geral</h2>
                        <p class="text-sm text-gray-500">Selecione o período para análise.</p>
                      </div>
                      <div class="flex items-center gap-4 flex-wrap">
                        <div class="flex items-center gap-2">
                            <label class="text-sm text-gray-600" for="dash-month">Mês:</label>
                            <input id="dash-month-input" type="month" class="border rounded-md p-2" />
                            <button id="dash-apply-btn" class="btn-primary px-4 py-2 rounded-md">Aplicar</button>
                        </div>
                      </div>
                </div>
                <!-- Ações Rápidas -->
                <div class="card p-6 mb-8">
                    <h3 class="text-xl font-semibold mb-4">Ações Rápidas</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <button onclick="openModal('modal-nova-venda')" class="flex flex-col items-center justify-center p-6 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                            <svg class="w-8 h-8 text-blue-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                            <span class="font-semibold text-blue-800">Nova Venda</span>
                        </button>
                        <button onclick="openModal('modal-nova-producao')" class="flex flex-col items-center justify-center p-6 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
                            <svg class="w-8 h-8 text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"></path></svg>
                            <span class="font-semibold text-green-800">Novo Lote de Produção</span>
                        </button>
                        <button onclick="openModal('modal-nova-compra')" class="flex flex-col items-center justify-center p-6 bg-yellow-50 hover:bg-yellow-100 rounded-lg transition-colors">
                            <svg class="w-8 h-8 text-yellow-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                            <span class="font-semibold text-yellow-800">Registrar Compra</span>
                        </button>
                    </div>
                </div>
                 <!-- KPIs -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
                  <div class="card p-4 flex items-start gap-4 xl:col-span-2">
                    <div class="bg-blue-100 text-blue-600 p-2 rounded-full shrink-0"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01"></path></svg></div>
                    <div class="overflow-hidden min-w-0">
                      <p class="text-xs uppercase text-gray-500 truncate">Receita do Mês</p>
                      <p id="kpi-receita" class="text-lg md:text-xl xl:text-2xl font-bold whitespace-nowrap">R$ 0,00</p>
                      <p id="kpi-receita-delta" class="text-xs mt-1 text-gray-500 truncate">—</p>
                    </div>
                  </div>
                   <div class="card p-4 flex items-start gap-4 xl:col-span-2">
                    <div class="bg-green-100 text-green-600 p-2 rounded-full shrink-0"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg></div>
                    <div class="overflow-hidden min-w-0">
                      <p class="text-xs uppercase text-gray-500 truncate">Lucro do Mês</p>
                      <p id="kpi-lucro" class="text-xl md:text-xl xl:text-2xl font-bold text-green-600 whitespace-nowrap">R$ 0,00</p>
                      <p id="kpi-lucro-delta" class="text-xs mt-1 text-gray-500 truncate">—</p>
                    </div>
                  </div>
                   <div class="card p-4 flex items-start gap-4">
                    <div class="bg-pink-100 text-pink-600 p-2 rounded-full shrink-0"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h5V4H4zm0 12h5v-5H4v5zm12 0h5v-5h-5v5zM16 4v5h5V4h-5z"></path></svg></div>
                    <div class="overflow-hidden min-w-0">
                      <p class="text-xs uppercase text-gray-500 truncate">Custo Produção</p>
                      <p id="kpi-custo-producao" class="text-lg md:text-xl xl:text-2xl font-bold whitespace-nowrap">R$ 0,00</p>
                    </div>
                  </div>
                   <div class="card p-4 flex items-start gap-4">
                    <div class="bg-indigo-100 text-indigo-600 p-2 rounded-full shrink-0"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg></div>
                    <div class="overflow-hidden min-w-0">
                      <p class="text-xs uppercase text-gray-500 truncate">Ticket Médio</p>
                      <p id="kpi-ticket" class="text-lg md:text-xl xl:text-2xl font-bold whitespace-nowrap">R$ 0,00</p>
                    </div>
                  </div>
                   <div class="card p-4 flex items-start gap-4">
                    <div id="kpi-alert-mp" class="bg-gray-100 text-gray-600 p-2 rounded-full shrink-0"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></div>
                    <div class="overflow-hidden min-w-0">
                      <p class="text-xs uppercase text-gray-500 truncate">MP Baixo</p>
                      <p id="kpi-estoque-baixo-mp" class="text-lg md:text-xl xl:text-2xl font-bold text-gray-600 whitespace-nowrap">0</p>
                    </div>
                  </div>
                  <div class="card p-4 flex items-start gap-4">
                    <div id="kpi-alert-produto" class="bg-gray-100 text-gray-600 p-2 rounded-full shrink-0"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></div>
                    <div class="overflow-hidden min-w-0">
                      <p class="text-xs uppercase text-gray-500 truncate">Produto Baixo</p>
                      <p id="kpi-estoque-baixo-produto" class="text-lg md:text-xl xl:text-2xl font-bold text-gray-600 whitespace-nowrap">0</p>
                    </div>
                  </div>
                </div>
            `;
            container.innerHTML = html;

            // Re-atribui os listeners dos elementos que acabaram de ser criados
            document.getElementById('dash-month-input').value = selectedMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
            document.getElementById('dash-apply-btn').addEventListener('click', () => {
                selectedMonth = document.getElementById('dash-month-input').value || null;
                renderDashboard();
            });

            const { start, end, prevStart, prevEnd } = getMonthRange(selectedMonth);
            const vendasPeriodo = localDb.vendas.filter(v => v.status !== 'Cancelado' && inRangeTS(v.createdAt, start, end));
            const vendasPrev = localDb.vendas.filter(v => v.status !== 'Cancelado' && inRangeTS(v.createdAt, prevStart, prevEnd));

            const receita = vendasPeriodo.reduce((s, v) => s + (v.receitaLiquida || 0), 0);
            const receitaPrev = vendasPrev.reduce((s, v) => s + (v.receitaLiquida || 0), 0);
            const lucro = vendasPeriodo.reduce((s, v) => s + (v.lucro || 0), 0);
            const lucroPrev = vendasPrev.reduce((s, v) => s + (v.lucro || 0), 0);

            const producaoPeriodo = localDb.producao.filter(p => inRangeTS(p.createdAt, start, end));
            const custoProducao = producaoPeriodo.reduce((s, p) => s + (p.custoTotal || 0), 0);

            const pedidos = vendasPeriodo.length;
            const ticketMedio = pedidos ? (receita / pedidos) : 0;
            const insumosBaixos = localDb.insumos.filter(i => Number(i.qtdEstoque || 0) <= Number(i.estoqueMinimo || 0));
            const produtosBaixos = localDb.produtos.filter(p => Number(p.qtdEstoque || 0) <= Number(p.estoqueMinimo || 0));

            const kpiAlertMP = document.getElementById('kpi-alert-mp');
            if (insumosBaixos.length > 0) { kpiAlertMP.classList.replace('bg-gray-100', 'bg-red-100'); kpiAlertMP.classList.replace('text-gray-600', 'text-red-600'); kpiAlertMP.classList.add('alert-pulse'); }
            else { kpiAlertMP.classList.replace('bg-red-100', 'bg-gray-100'); kpiAlertMP.classList.replace('text-red-600', 'text-gray-600'); kpiAlertMP.classList.remove('alert-pulse'); }

            const kpiAlertProduto = document.getElementById('kpi-alert-produto');
            if (produtosBaixos.length > 0) { kpiAlertProduto.classList.replace('bg-gray-100', 'bg-red-100'); kpiAlertProduto.classList.replace('text-gray-600', 'text-red-600'); kpiAlertProduto.classList.add('alert-pulse'); }
            else { kpiAlertProduto.classList.replace('bg-red-100', 'bg-gray-100'); kpiAlertProduto.classList.replace('text-red-600', 'text-gray-600'); kpiAlertProduto.classList.remove('alert-pulse'); }

            document.getElementById('kpi-receita').textContent = currencyFormatter.format(receita);
            formatDelta(document.getElementById('kpi-receita-delta'), receita, receitaPrev);
            document.getElementById('kpi-lucro').textContent = currencyFormatter.format(lucro);
            formatDelta(document.getElementById('kpi-lucro-delta'), lucro, lucroPrev);
            document.getElementById('kpi-custo-producao').textContent = currencyFormatter.format(custoProducao);
            document.getElementById('kpi-ticket').textContent = currencyFormatter.format(ticketMedio);
            document.getElementById('kpi-estoque-baixo-mp').textContent = insumosBaixos.length;
            document.getElementById('kpi-estoque-baixo-produto').textContent = produtosBaixos.length;

            renderDashboardCharts(start, end);
        }

        let lucroChart, produtosChart, clientesChart;
        function renderDashboardCharts(start, end) {
            const chartColors = ['#36a2eb', '#4bc0c0', '#ff6384', '#ff9f40', '#9966ff'];
            const dailyData = {};
            const range = (end.getTime() - start.getTime()) / (1000 * 3600 * 24);
            for (let i = 0; i <= range; i++) {
                const d = new Date(start);
                d.setDate(d.getDate() + i);
                dailyData[d.toISOString().slice(0, 10)] = { receita: 0, cogs: 0, lucro: 0 };
            }
            localDb.vendas.forEach(v => {
                if (v.status === 'Cancelado' || !inRangeTS(v.createdAt, start, end)) return;
                const key = v.createdAt.toDate().toISOString().slice(0, 10);
                if (dailyData[key]) {
                    dailyData[key].receita += Number(v.receitaLiquida || 0);
                    dailyData[key].cogs += (Number(v.custoUnitario || 0) * Number(v.qtd || 0));
                    dailyData[key].lucro += (Number(v.lucro || 0));
                }
            });
            const labels = Object.keys(dailyData).sort();
            const bySku = {};
            localDb.vendas.forEach(v => {
                if (v.status === 'Cancelado' || !inRangeTS(v.createdAt, start, end)) return;
                bySku[v.sku] = (bySku[v.sku] || 0) + Number(v.receitaLiquida || 0);
            });
            const top = Object.entries(bySku).sort((a, b) => b[1] - a[1]).slice(0, 5);

            document.getElementById('lucro-chart-card').innerHTML = '<canvas id="lucro-chart-canvas"></canvas>';
            document.getElementById('produtos-chart-card').innerHTML = '<canvas id="produtos-chart-canvas"></canvas>';
            if (window.lucroChart) window.lucroChart.destroy();
            if (window.produtosChart) window.produtosChart.destroy();

            window.lucroChart = new Chart(document.getElementById('lucro-chart-canvas'), {
                type: 'line',
                data: {
                    labels, datasets: [
                        { label: 'Receita', data: labels.map(k => dailyData[k].receita), borderColor: chartColors[0], tension: 0.1 },
                        { label: 'Custo (COGS)', data: labels.map(k => dailyData[k].cogs), borderColor: chartColors[2], tension: 0.1 },
                        { label: 'Lucro Bruto', data: labels.map(k => dailyData[k].lucro), borderColor: chartColors[1], tension: 0.1, borderDash: [5, 5] }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
            window.produtosChart = new Chart(document.getElementById('produtos-chart-canvas'), {
                type: 'bar',
                data: { labels: top.map(([k]) => k), datasets: [{ label: 'Receita por SKU', data: top.map(([_, v]) => v), backgroundColor: chartColors }] },
                options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
            });
        }

        // --- SEÇÕES DE DADOS (VENDAS, ESTOQUE, ETC.) ---
        function applyFilters(data, type) {
            let filteredData = [...data];
            const search = filters[type].search;
            let startDate = filters[type].startDate;
            let endDate = filters[type].endDate;

            if (startDate && typeof startDate === 'string' && isValidDateString(startDate)) startDate = new Date(startDate + 'T00:00:00');
            if (endDate && typeof endDate === 'string' && isValidDateString(endDate)) endDate = new Date(endDate + 'T23:59:59');

            if (type === 'insumos') {
                if (filters.insumos.fornecedor) {
                    filteredData = filteredData.filter(i => i.fornecedor === filters.insumos.fornecedor);
                }
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

        function renderVendas() {
            const filteredVendas = applyFilters(localDb.vendas, 'vendas');
            const container = document.getElementById('vendas-content');

            // Analytics
            const totalVendido = filteredVendas.reduce((acc, v) => acc + (v.receitaLiquida || 0), 0);
            const totalPedidos = filteredVendas.length;
            const clientes = filteredVendas.reduce((acc, v) => {
                acc[v.cliente] = (acc[v.cliente] || 0) + v.receitaLiquida;
                return acc;
            }, {});
            const topCliente = Object.entries(clientes).sort((a, b) => b[1] - a[1])[0];

            document.getElementById('vendas-kpi-total').textContent = currencyFormatter.format(totalVendido);
            document.getElementById('vendas-kpi-pedidos').textContent = totalPedidos;
            document.getElementById('vendas-kpi-cliente').textContent = topCliente ? topCliente[0] : '—';

            const top5Clientes = Object.entries(clientes).sort((a, b) => b[1] - a[1]).slice(0, 5);
            document.getElementById('clientes-chart-card').innerHTML = '<canvas id="clientes-chart-canvas"></canvas>';
            if (window.clientesChart) window.clientesChart.destroy();
            window.clientesChart = new Chart(document.getElementById('clientes-chart-canvas'), {
                type: 'bar',
                data: {
                    labels: top5Clientes.map(c => c[0]),
                    datasets: [{
                        label: 'Receita por Cliente',
                        data: top5Clientes.map(c => c[1]),
                        backgroundColor: ['#36a2eb', '#4bc0c0', '#ff6384', '#ff9f40', '#9966ff']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
            });

            if (localDb.vendas.length === 0) {
                renderEmptyState('vendas-content', 'Nenhuma Venda Registrada', 'Registre sua primeira venda para ver os dados e gráficos de performance aqui.');
                document.getElementById('vendas-analytics').classList.add('hidden');
                document.getElementById('clientes-chart-card').parentElement.classList.add('hidden');
                return;
            }
            document.getElementById('vendas-analytics').classList.remove('hidden');
            document.getElementById('clientes-chart-card').parentElement.classList.remove('hidden');

            container.innerHTML = `
            <div class="overflow-x-auto">
                <table id="vendas-table-container" class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qtd</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Receita</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lucro</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="vendas-table" class="bg-white divide-y divide-gray-200">
                        ${filteredVendas.map(v => `<tr>
                            <td class="px-4 py-3">${formatDate(v.createdAt)}</td>
                            <td class="px-4 py-3">${v.cliente}</td>
                            <td class="px-4 py-3">${v.sku}</td>
                            <td class="px-4 py-3">${numberFormatter.format(v.qtd)}</td>
                            <td class="px-4 py-3">${currencyFormatter.format(v.receitaLiquida)}</td>
                            <td class="px-4 py-3 font-medium text-green-600">${currencyFormatter.format(v.lucro || 0)}</td>
                            <td class="px-4 py-3">${v.status}</td>
                            <td class="px-4 py-3 text-sm font-medium">
                                <button disabled class="text-gray-400 cursor-not-allowed" title="Edição de vendas desabilitada. Exclua e crie novamente.">Editar</button>
                                <button onclick="window.openDeleteModal('${v.id}', 'venda', 'Venda para ${v.cliente}', '${v.financeiroId}')" class="text-red-600 hover:text-red-900 ml-4">Excluir</button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        }

        function renderFinanceiro() {
            const totalEntradas = localDb.financeiro.filter(t => t.tipo === 'entrada').reduce((sum, t) => sum + t.valor, 0);
            const totalSaidas = localDb.financeiro.filter(t => t.tipo === 'saida').reduce((sum, t) => sum + t.valor, 0);
            document.getElementById('financeiro-entradas').textContent = currencyFormatter.format(totalEntradas);
            document.getElementById('financeiro-saidas').textContent = currencyFormatter.format(totalSaidas);
            document.getElementById('financeiro-saldo').textContent = currencyFormatter.format(totalEntradas - totalSaidas);

            const filteredFinanceiro = applyFilters(localDb.financeiro, 'financeiro');
            const container = document.getElementById('financeiro-content');

            if (localDb.financeiro.length === 0) {
                renderEmptyState('financeiro-content', 'Nenhuma Transação Registrada', 'Adicione uma transação para começar a controlar seu fluxo de caixa.');
                return;
            }

            container.innerHTML = `
                <div class="overflow-x-auto">
                    <table id="financeiro-table-container" class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="financeiro-table" class="bg-white divide-y divide-gray-200">
                        ${filteredFinanceiro.map(t => `<tr>
                            <td class="px-4 py-3">${formatDate(t.createdAt)}</td>
                            <td class="px-4 py-3">${t.descricao}</td><td class="px-4 py-3">${t.categoria}</td>
                            <td class="px-4 py-3 text-right font-medium ${t.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}">${t.tipo === 'saida' ? '-' : ''}${currencyFormatter.format(t.valor)}</td>
                            <td class="px-4 py-3 text-sm font-medium">
                                <button ${t.isAutomatic ? 'disabled' : ''} onclick="${t.isAutomatic ? '' : `window.openEditModal('${t.id}', 'financeiro')`}" class="${t.isAutomatic ? 'text-gray-400 cursor-not-allowed' : 'text-indigo-600 hover:text-indigo-900'}">Editar</button>
                                <button ${t.isAutomatic ? 'disabled' : ''} onclick="${t.isAutomatic ? '' : `window.openDeleteModal('${t.id}', 'financeiro', '${t.descricao}')`}" class="${t.isAutomatic ? 'text-gray-400 cursor-not-allowed' : 'text-red-600 hover:text-red-900'} ml-4">Excluir</button>
                            </td>
                        </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`;
        }

        function populateFormOptions() {
            const byId = (id) => document.getElementById(id);
            const insumos = localDb.insumos || [];
            const produtos = localDb.produtos || [];

            const fornecedores = [...new Set(insumos.map(i => i.fornecedor).filter(Boolean))];
            const fornecedorFilterEl = byId('insumo-filter-fornecedor');
            if (fornecedorFilterEl) {
                const currentVal = fornecedorFilterEl.value;
                fornecedorFilterEl.innerHTML = `<option value="">Todos os Fornecedores</option>${fornecedores.map(f => `<option value="${f}">${f}</option>`).join('')}`;
                fornecedorFilterEl.value = currentVal;
            }

            const fillDL = (id, arr) => { const dl = byId(id); if (dl) dl.innerHTML = arr.map(v => `<option value="${v}">`).join(''); };
            fillDL('estampas-list', [...new Set(insumos.filter(i => i.tipo === 'tecido' && i.modelo).map(i => i.modelo))]);
            fillDL('tipos-tecido-list', [...new Set(insumos.filter(i => i.tipo === 'tecido' && i.tecidoTipo).map(i => i.tecidoTipo))]);
            fillDL('fornecedores-list', fornecedores);
            fillDL('composicoes-linha-list', [...new Set(insumos.filter(i => i.tipo === 'linha' && i.composicao).map(i => i.composicao))]);
            fillDL('materiais-botoes-list', [...new Set(insumos.filter(i => i.tipo === 'botoes' && i.material).map(i => i.material))]);

            const insSel = byId('producao-insumo-select');
            if (insSel) insSel.innerHTML = `<option value="" disabled selected>Selecione...</option>${insumos.map(i => `<option value="${i.id}" data-un="${i.unidade || ''}">${i.nome || '(sem nome)'} (estoque: ${Number(i.qtdEstoque || 0)} ${i.unidade || ''})</option>`).join('')}`;

            const vendaSkuEl = byId('venda-sku');
            const producaoSkuEl = byId('producao-sku');
            const hasProducts = produtos.length > 0;
            const placeholder = hasProducts ? 'Selecione...' : 'Cadastre um produto primeiro';
            const produtoOptions = produtos.map(p => `<option value="${p.id}" data-sku="${p.sku || ''}" data-custo="${Number(p.custoUnitario || 0)}">${p.sku || '(sem SKU)'} (estoque: ${p.qtdEstoque})</option>`).join('');

            if (vendaSkuEl) vendaSkuEl.innerHTML = `<option value="" disabled selected>${placeholder}</option>${produtoOptions}`;
            if (producaoSkuEl) {
                producaoSkuEl.innerHTML = `<option value="" disabled selected>${placeholder}</option>${produtoOptions}`;
                producaoSkuEl.disabled = !hasProducts;
            }
            if (newlyCreatedProductSKU) {
                const newOption = Array.from(producaoSkuEl.options).find(opt => opt.text.startsWith(newlyCreatedProductSKU));
                if (newOption) {
                    newOption.selected = true;
                }
                newlyCreatedProductSKU = null; // Limpa a flag
            }
        }

        function renderEstoque() {
            const container = document.getElementById('estoque-content');
            if (localDb.produtos.length === 0) {
                renderEmptyState('estoque-content', 'Nenhum Produto Cadastrado', 'Cadastre seus produtos acabados aqui para controlar o estoque.');
                return;
            }
            container.innerHTML = `
             <div class="overflow-x-auto">
                <table id="estoque-table-container" class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                       <tr>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qtd. em Estoque</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estoque Mínimo</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Custo Unitário</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                       </tr>
                   </thead>
                    <tbody id="estoque-table" class="bg-white divide-y divide-gray-200">
                    ${localDb.produtos.map(p => {
                const low = Number(p.qtdEstoque || 0) <= Number(p.estoqueMinimo || 0);
                return `<tr class="${low ? 'bg-red-50' : ''}">
                        <td class="px-4 py-3 font-medium">${p.sku || '—'}</td>
                        <td class="px-4 py-3">${numberFormatter.format(p.qtdEstoque || 0)}</td>
                        <td class="px-4 py-3">${numberFormatter.format(p.estoqueMinimo || 0)}</td>
                        <td class="px-4 py-3">
                           ${currencyFormatter.format(p.custoUnitario || 0)}
                           ${(p.custoUnitario === 0) ? `
                            <span class="tooltip">
                                <span class="ml-1 text-blue-500 cursor-help">🛈</span>
                                <span class="tooltiptext">Custo será calculado e preenchido automaticamente ao final do primeiro lote.</span>
                            </span>` : ''}
                        </td>
                        <td class="px-4 py-3">${low ? '<span class="text-red-600 font-semibold">Baixo</span>' : 'OK'}</td>
                        <td class="px-4 py-3 text-sm">
                            <button onclick="window.openEditModal('${p.id}', 'produto')" class="text-indigo-600 hover:text-indigo-900">Editar</button>
                            <button onclick="window.openDeleteModal('${p.id}', 'produto', '${p.sku || ''}')" class="text-red-600 hover:text-red-900 ml-4">Excluir</button>
                        </td>
                        </tr>`;
            }).join('')}
                    </tbody>
                </table>
            </div>`;
        }
        function renderInsumos() {
            const container = document.getElementById('insumos-content');
            const filteredInsumos = applyFilters(localDb.insumos, 'insumos');

            if (localDb.insumos.length === 0) {
                renderEmptyState('insumos-content', 'Nenhuma Matéria-Prima', 'Registre a compra de tecidos, linhas e outros materiais.');
                return;
            }
            container.innerHTML = `
            <div class="overflow-x-auto">
                <table id="insumos-table-container" class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qtd. em Estoque</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unidade</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Custo/Unidade</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                       </tr>
                    </thead>
                    <tbody id="insumos-table" class="bg-white divide-y divide-gray-200">
                    ${filteredInsumos.map(i => {
                const low = Number(i.qtdEstoque || 0) <= Number(i.estoqueMinimo || 0);
                return `<tr class="${low ? 'bg-red-50' : ''}">
                        <td class="px-4 py-3 font-medium">${i.nome || '—'}</td>
                        <td class="px-4 py-3">${numberFormatter.format(i.qtdEstoque || 0)}</td>
                        <td class="px-4 py-3">${i.unidade || '—'}</td>
                        <td class="px-4 py-3">${currencyFormatter.format(i.custo || 0)}</td>
                        <td class="px-4 py-3">${i.fornecedor || '—'}</td>
                        <td class="px-4 py-3 text-sm">
                            <button onclick="window.openEditModal('${i.id}', 'insumo')" class="text-indigo-600 hover:text-indigo-900">Editar</button>
                            <button onclick="window.openDeleteModal('${i.id}', 'insumo', '${(i.nome || '').replace(/"/g, '&quot;')}', '${i.financeiroId}')" class="text-red-600 hover:text-red-900 ml-4">Excluir</button>
                        </td>
                        </tr>`;
            }).join('')}
                    </tbody>
                </table>
             </div>`;
        }
        function renderProducao() {
            const container = document.getElementById('producao-content');
            if (localDb.producao.length === 0) {
                renderEmptyState('producao-content', 'Nenhum Lote em Produção', 'Inicie um novo lote para transformar sua matéria-prima em produtos.');
                return;
            }
            container.innerHTML = `
            <div class="overflow-x-auto">
                <table id="producao-table-container" class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lote</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data Pedido</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data Entrega</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item Produzido</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qtd</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Custo/Peça</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                           <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                       </tr>
            if (type === 'producao') {
                document.getElementById('modal-producao-title').textContent = 'Editar Lote de Produção';
                document.getElementById('producao-id').value = id;
                document.getElementById('producao-lote').value = item.lote;
                document.getElementById('producao-sku').value = item.produtoId;
                document.getElementById('producao-qtd').value = item.qtd;
                document.getElementById('producao-data-entrega').value = dateToInput(item.dataEntrega);
                document.getElementById('producao-status').value = item.status;
                document.getElementById('producao-obs').value = item.observacoes || '';
                document.getElementById('producao-mao-de-obra').value = item.custoMaoDeObra || 0;
                
                const insumosList = document.getElementById('producao-insumos-list');
                insumosList.innerHTML = '';
                if (item.insumosUtilizados) {
                    item.insumosUtilizados.forEach(insumo => {
                         const li = document.createElement('li');
                         li.className = 'flex justify-between items-center bg-gray-50 p-2 rounded mb-2';
                         li.dataset.id = insumo.id;
                         li.dataset.qtd = insumo.qtd;
                         li.dataset.custo = insumo.custoUnitario;
                         li.dataset.totalcost = insumo.custoTotal;
                         li.innerHTML = `
                < span > ${ insumo.nome } (${ insumo.qtd } ${ insumo.unidade })</span >
                    <div class="flex items-center">
                        <span class="mr-4 text-sm text-gray-600">${currencyFormatter.format(insumo.custoTotal)}</span>
                        <button type="button" class="text-red-600 hover:text-red-800" onclick="this.parentElement.parentElement.remove(); updateProductionCost()">Remover</button>
                    </div>
            `;
                         insumosList.appendChild(li);
                    });
                }
                updateProductionCost();
                openModal('modal-nova-producao');
            } else if (type === 'produto') {
                document.getElementById('modal-editar-produto-title').textContent = 'Editar Produto';
                document.getElementById('edit-produto-id').value = id;
                document.getElementById('edit-produto-sku').value = item.sku;
                document.getElementById('edit-produto-estoque').value = item.qtdEstoque;
                document.getElementById('edit-produto-estoque-minimo').value = item.estoqueMinimo;
                document.getElementById('edit-produto-custo').value = item.custoUnitario;
                openModal('modal-editar-produto');
            } else if (type === 'insumo') {
                document.getElementById('modal-editar-insumo-title').textContent = 'Editar Matéria-Prima';
                document.getElementById('edit-insumo-id').value = id;
                document.getElementById('edit-insumo-nome').value = item.nome;
                document.getElementById('edit-insumo-estoque').value = item.qtdEstoque;
                document.getElementById('edit-insumo-unidade').value = item.unidade;
                document.getElementById('edit-insumo-custo').value = item.custo;
                document.getElementById('edit-insumo-fornecedor').value = item.fornecedor;
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
            }
        }
        window.openEditModal = openEditModal;

        let currentProductionCost = { total: 0, perPiece: 0 };
        const updateProductionCost = () => {
            const qtd = asNumber('producao-qtd', true) || 1;
            const custoMaoDeObra = asNumber('producao-mao-de-obra', true);
            let custoTotalInsumos = 0;
            document.getElementById('producao-insumos-list').querySelectorAll('li').forEach(item => {
                custoTotalInsumos += parseFloat(item.dataset.totalcost);
            });
            const custoTotalLote = (custoMaoDeObra * qtd) + custoTotalInsumos;
            const custoPorPeca = custoTotalLote / qtd;
            
            currentProductionCost = { total: custoTotalLote, perPiece: custoPorPeca };
            
            const totalEl = document.getElementById('producao-custo-total');
            const perPieceEl = document.getElementById('producao-custo-peca');
            if (totalEl) totalEl.textContent = currencyFormatter.format(custoTotalLote);
            if (perPieceEl) perPieceEl.textContent = currencyFormatter.format(custoPorPeca);
        };

        function wireProductionModal() {
            const btnAddInsumo = document.getElementById('btn-add-insumo-producao');
            if (btnAddInsumo) {
                const newBtn = btnAddInsumo.cloneNode(true);
                btnAddInsumo.parentNode.replaceChild(newBtn, btnAddInsumo);
                
                newBtn.addEventListener('click', () => {
                    const select = document.getElementById('producao-insumo-select');
                    const qtdInput = document.getElementById('producao-insumo-qtd');
                    const option = select.options[select.selectedIndex];
                    
                    if (!option || !option.value || !qtdInput.value) {
                        showToast('Selecione um insumo e informe a quantidade.', 'error');
                        return;
                    }

                    const insumoId = option.value;
                    const qtd = parseFloat(qtdInput.value);
                    const insumo = localDb.insumos.find(i => i.id === insumoId);
                    
                    if (!insumo) return;

                    const custoTotal = insumo.custo * qtd;
                    
                    const li = document.createElement('li');
                    li.className = 'flex justify-between items-center bg-gray-50 p-2 rounded mb-2';
                    li.dataset.id = insumoId;
                    li.dataset.qtd = qtd;
                    li.dataset.custo = insumo.custo;
                    li.dataset.totalcost = custoTotal;
                    li.innerHTML = `
                < span > ${ insumo.nome } (${ qtd } ${ insumo.unidade })</span >
                    <div class="flex items-center">
                        <span class="mr-4 text-sm text-gray-600">${currencyFormatter.format(custoTotal)}</span>
                        <button type="button" class="text-red-600 hover:text-red-800" onclick="this.parentElement.parentElement.remove(); updateProductionCost()">Remover</button>
                    </div>
                    `;

                    document.getElementById('producao-insumos-list').appendChild(li);
                    select.value = "";
                    qtdInput.value = "";
                    updateProductionCost();
                });
            }

            ['producao-qtd', 'producao-mao-de-obra'].forEach(id => {
                document.getElementById(id)?.addEventListener('input', updateProductionCost);
            });
        }

        document.addEventListener('DOMContentLoaded', () => {
            setupNavigation();
            setupModalClosers();
            setupFilterListeners();

            renderFinanceiro();
            renderEstoque();
            renderInsumos();
            renderProducao();
            populateFormOptions();

            updateProductionCost();

            setupExportListeners();
            wireForms();
            wireProductionModal();
            bindTecidoUnidadeRadios();

            document.getElementById('insumo-tipo')?.addEventListener('change', () => {
                updateInsumoForm();
            });

            document.getElementById('form-nova-compra')?.addEventListener('submit', (e) => {
                const tipo = document.getElementById('insumo-tipo')?.value;
                if (tipo === 'tecido') {
                    const selected = document.querySelector('input[name="tecido-unidade"]:checked')?.value || 'metros';
                    const unidadeInput = document.getElementById('insumo-unidade');
                    if (unidadeInput) unidadeInput.value = selected;
                    setPreferredTecidoUnit(selected);
                }
            });

            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    if (!initialDataLoaded) initializeAppListeners();
                } else {
                    try {
                        if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
                        else await signInAnonymously(auth);
                    } catch (error) {
                        console.warn("Token sign-in failed, fallback to anonymous:", error.message);
                        try { await signInAnonymously(auth); }
                        catch (anonError) { console.error("Anonymous sign-in also failed:", anonError); hideLoading(); showToast("Falha crítica na autenticação.", 'error'); }
                    }
                }
            });
        });

    
