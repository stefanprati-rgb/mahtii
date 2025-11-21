import { db, appId } from './config.js';
import { collection, onSnapshot, query, orderBy, doc, runTransaction, writeBatch, serverTimestamp, increment, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Estado da Aplicação (Dados)
export const localDb = {
    produtos: [],
    vendas: [],
    insumos: [],
    producao: [],
    financeiro: []
};

export const filters = {
    vendas: { search: '', startDate: null, endDate: null },
    financeiro: { search: '', startDate: null, endDate: null },
    insumos: { fornecedor: '' }
};

export let dbRefs = {};
export let initialDataLoaded = false;
export let newlyCreatedProductSKU = null;

// Listener de Banco de Dados
export function initializeAppListeners(onDataUpdateCallback) {
    const collectionsToLoad = Object.keys(localDb);
    let loadedCount = 0;

    const checkAllLoaded = () => {
        loadedCount++;
        if (loadedCount >= collectionsToLoad.length) {
            initialDataLoaded = true;
            if (onDataUpdateCallback) onDataUpdateCallback();
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

    Object.keys(dbRefs).forEach(key => {
        const ref = dbRefs[key];
        const q = query(ref, orderBy('createdAt', 'desc'));
        onSnapshot(q, (snapshot) => {
            localDb[key] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (initialDataLoaded) {
                if (onDataUpdateCallback) onDataUpdateCallback();
            } else {
                checkAllLoaded();
            }
        }, (err) => {
            console.error(`Erro no listener ${key}:`, err);
            checkAllLoaded();
        });
    });
}

// --- LÓGICA DE NEGÓCIO CRÍTICA ---

// 1. Exclusão com Estorno (CORRIGIDA: Leituras antes das Escritas)
export async function deleteItem(id, type, financeiroId) {
    const map = { venda: 'vendas', produto: 'produtos', insumo: 'insumos', producao: 'producao', financeiro: 'financeiro' };
    const colKey = map[type];
    if (!colKey) throw new Error('Tipo inválido para exclusão.');

    await runTransaction(db, async (transaction) => {
        const itemRef = doc(dbRefs[colKey], id);

        // --- BLOCO DE LEITURAS (READS) ---
        // O Firestore exige que TODAS as leituras sejam feitas antes de qualquer escrita
        const itemDoc = await transaction.get(itemRef);

        let financeiroRef = null;
        let finDoc = null;

        // Se houver ID financeiro, lemos agora (antes de escrever qualquer coisa)
        if (financeiroId) {
            financeiroRef = doc(dbRefs.financeiro, financeiroId);
            finDoc = await transaction.get(financeiroRef);
        }

        if (!itemDoc.exists()) throw new Error("Item não encontrado. Talvez já excluído.");
        const data = itemDoc.data();

        // --- BLOCO DE ESCRITAS (WRITES) ---

        // Estorno Venda
        if (type === 'venda' && data.produtoId && data.qtd) {
            const produtoRef = doc(dbRefs.produtos, data.produtoId);
            transaction.update(produtoRef, { qtdEstoque: increment(data.qtd) });
        }

        // Estorno Produção
        if (type === 'producao') {
            if (data.insumos && Array.isArray(data.insumos)) {
                for (const item of data.insumos) {
                    const insumoRef = doc(dbRefs.insumos, item.id);
                    transaction.update(insumoRef, { qtdEstoque: increment(item.qtd) });
                }
            }
            // Se o lote já foi recebido, retira do estoque de produtos
            if (data.status === 'Recebido' && data.produtoId) {
                const produtoRef = doc(dbRefs.produtos, data.produtoId);
                transaction.update(produtoRef, { qtdEstoque: increment(-data.qtd) });
            }
        }

        // Deletar o item principal
        transaction.delete(itemRef);

        // Deletar o financeiro (se foi lido e existe)
        if (finDoc && finDoc.exists()) {
            transaction.delete(financeiroRef);
        }
    });
}

// 2. Salvar Compra (Com Agrupamento Inteligente)
export async function salvarCompra(dados) {
    const { tipo, nome, extra, qtdComprada, custoNovo, estoqueMinimo, unidade } = dados;
    const valorTotalCompra = custoNovo * qtdComprada;

    let existingItem = null;
    if (localDb.insumos && localDb.insumos.length > 0) {
        existingItem = localDb.insumos.find(i => {
            if (i.tipo !== tipo) return false;
            if (tipo === 'tecido') return i.modelo === extra.modelo && i.tecidoTipo === extra.tecidoTipo && i.fornecedor === extra.fornecedor;
            if (tipo === 'linha') return i.composicao === extra.composicao && i.espessura === extra.espessura && i.fornecedor === extra.fornecedor && i.nome === nome;
            if (tipo === 'botoes') return i.material === extra.material && i.tamanho === extra.tamanho && i.fornecedor === extra.fornecedor && i.nome === nome;
            if (tipo === 'entretela') return i.entretelaTipo === extra.entretelaTipo && i.fornecedor === extra.fornecedor && i.nome === nome;
            return i.nome === nome;
        });
    }

    const batch = writeBatch(db);
    const financeiroRef = doc(collection(db, dbRefs.financeiro.path));

    batch.set(financeiroRef, {
        descricao: `Compra: ${qtdComprada}x ${nome}`,
        tipo: 'saida',
        categoria: 'Matéria-Prima',
        valor: valorTotalCompra,
        createdAt: serverTimestamp(),
        isAutomatic: true,
        relatedDocId: existingItem ? existingItem.id : null
    });

    if (existingItem) {
        // Atualiza Existente + Custo Médio
        const insumoRef = doc(dbRefs.insumos, existingItem.id);
        const qtdAtual = Number(existingItem.qtdEstoque || 0);
        const custoAtual = Number(existingItem.custo || 0);
        const novoCustoMedio = ((qtdAtual * custoAtual) + valorTotalCompra) / (qtdAtual + qtdComprada);

        batch.update(insumoRef, {
            qtdEstoque: increment(qtdComprada),
            custo: novoCustoMedio,
            estoqueMinimo: estoqueMinimo,
            unidade: unidade
        });
        if (!financeiroRef.relatedDocId) financeiroRef.relatedDocId = existingItem.id;

    } else {
        // Cria Novo
        const insumoRef = doc(collection(db, dbRefs.insumos.path));
        batch.update(financeiroRef, { relatedDocId: insumoRef.id });
        batch.set(insumoRef, {
            nome, unidade, custo: custoNovo, qtdEstoque: qtdComprada, estoqueMinimo,
            createdAt: serverTimestamp(), financeiroId: financeiroRef.id, ...extra
        });

        // Auto-create SKUs for Tecido
        if (tipo === 'tecido' && dados.sizes && dados.sizes.length > 0) {
            for (const size of dados.sizes) {
                const produtoRef = doc(collection(db, dbRefs.produtos.path));
                batch.set(produtoRef, {
                    sku: `${nome.toUpperCase()} ${size}`, custoUnitario: 0, qtdEstoque: 0,
                    estoqueMinimo: 5, createdAt: serverTimestamp(), originatedFromInsumoId: insumoRef.id
                });
            }
        }
    }
    await batch.commit();
    return existingItem ? 'atualizado' : 'novo';
}

export async function salvarVenda(dados) {
    const { produtoId, qtdVendida, precoVenda, cliente, createdAt, status } = dados;

    await runTransaction(db, async (transaction) => {
        const produtoRef = doc(db, dbRefs.produtos.path, produtoId);
        const produtoDoc = await transaction.get(produtoRef);
        if (!produtoDoc.exists()) throw new Error("Produto não encontrado.");

        const produtoData = produtoDoc.data();
        if ((produtoData.qtdEstoque || 0) < qtdVendida) {
            throw new Error(`Estoque insuficiente para ${produtoData.sku}.`);
        }

        const receitaLiquida = precoVenda * qtdVendida;
        const custoUnitario = produtoData.custoUnitario || 0;
        const lucro = receitaLiquida - (custoUnitario * qtdVendida);

        const financeiroRef = doc(collection(db, dbRefs.financeiro.path));
        const vendaRef = doc(collection(db, dbRefs.vendas.path));

        transaction.set(financeiroRef, {
            descricao: `Venda: ${qtdVendida}x ${produtoData.sku} para ${cliente}`,
            tipo: 'entrada', categoria: 'Venda de Produto', valor: receitaLiquida,
            createdAt, isAutomatic: true, relatedDocId: vendaRef.id
        });
        transaction.set(vendaRef, {
            cliente, sku: produtoData.sku, qtd: qtdVendida, precoUnitario: precoVenda,
            receitaLiquida, lucro, status, createdAt, produtoId, custoUnitario,
            financeiroId: financeiroRef.id
        });
        transaction.update(produtoRef, { qtdEstoque: increment(-qtdVendida) });
    });
}

export async function salvarProducao(dados) {
    const { produtoId, qtdProduzida, maoDeObra, insumosUsados, status, loteNome, createdAt, dataEntrega } = dados;

    await runTransaction(db, async (transaction) => {
        // 1. Validação de Stock de Insumos
        for (const insumo of insumosUsados) {
            const insumoRef = doc(db, dbRefs.insumos.path, insumo.id);
            const insumoDoc = await transaction.get(insumoRef);
            const iData = insumoDoc.data();
            if (!insumoDoc.exists() || (iData.qtdEstoque || 0) < insumo.qtd) {
                throw new Error(`Estoque insuficiente para ${iData.nome || 'Insumo'}.`);
            }
        }

        const selectedProduto = localDb.produtos.find(p => p.id === produtoId);
        if (!selectedProduto) throw new Error("Produto não encontrado.");

        // 2. Cálculos Matemáticos
        const custoInsumos = insumosUsados.reduce((acc, i) => acc + (i.custo * i.qtd), 0);

        // Custo Total do Lote (Para valorização do Stock de Produtos Acabados)
        // Soma dos materiais + mão de obra
        const custoTotalLote = (maoDeObra * qtdProduzida) + custoInsumos;
        const custoPeca = qtdProduzida > 0 ? custoTotalLote / qtdProduzida : 0;

        // CORREÇÃO CONTABILÍSTICA:
        // O valor que sai do CAIXA é apenas a Mão de Obra.
        // Os insumos já foram pagos na compra (salvarCompra).
        const valorSaidaCaixa = maoDeObra * qtdProduzida;

        const loteRef = doc(collection(db, dbRefs.producao.path));

        // 3. Registo Financeiro (Apenas se houver custo de Mão de Obra)
        let financeiroId = null;
        if (valorSaidaCaixa > 0) {
            const financeiroRef = doc(collection(db, dbRefs.financeiro.path));
            financeiroId = financeiroRef.id;

            transaction.set(financeiroRef, {
                descricao: `Mão de Obra - Lote ${loteNome}`, // Descrição mais precisa
                tipo: 'saida',
                categoria: 'Custo de Produção (Mão de Obra)',
                valor: valorSaidaCaixa, // Apenas o valor da mão de obra sai do caixa
                createdAt,
                isAutomatic: true,
                relatedDocId: loteRef.id
            });
        }

        // 4. Registo do Lote de Produção
        transaction.set(loteRef, {
            lote: loteNome,
            produtoId,
            sku: selectedProduto.sku,
            qtd: qtdProduzida,
            maoDeObraUnitaria: maoDeObra,
            custoPeca,
            custoTotal: custoTotalLote, // Mantém o custo total para fins de relatório de custo
            status,
            insumos: insumosUsados,
            createdAt,
            dataEntrega,
            financeiroId: financeiroId
        });

        // 5. Baixa dos Insumos (Matéria-Prima)
        for (const insumo of insumosUsados) {
            transaction.update(doc(db, dbRefs.insumos.path, insumo.id), { qtdEstoque: increment(-insumo.qtd) });
        }

        // 6. Entrada de Produtos Acabados (Se status for Recebido)
        if (status === 'Recebido') {
            const produtoRef = doc(db, dbRefs.produtos.path, produtoId);
            const produtoDoc = await transaction.get(produtoRef);
            const { qtdEstoque: oldQtd = 0, custoUnitario: oldCusto = 0 } = produtoDoc.data();

            // Cálculo de Média Ponderada (Weighted Average Cost)
            // (Valor Antigo + Valor Novo) / Quantidade Total
            const novoCustoMedio = oldQtd + qtdProduzida > 0
                ? ((oldCusto * oldQtd) + custoTotalLote) / (oldQtd + qtdProduzida)
                : custoPeca;

            transaction.update(produtoRef, { qtdEstoque: increment(qtdProduzida), custoUnitario: novoCustoMedio });
        }
    });
}

export async function salvarProduto(dados) {
    await addDoc(dbRefs.produtos, {
        sku: dados.sku,
        custoUnitario: dados.custo,
        qtdEstoque: dados.estoque,
        estoqueMinimo: dados.minimo,
        createdAt: serverTimestamp(),
    });
    if (dados.source === 'producao') newlyCreatedProductSKU = dados.sku;
}

export async function salvarTransacao(dados, id = null) {
    if (id) {
        await updateDoc(doc(dbRefs.financeiro, id), dados);
    } else {
        await addDoc(dbRefs.financeiro, dados);
    }
}

export async function editarProduto(id, dados) {
    const ref = doc(dbRefs.produtos, id);
    await updateDoc(ref, dados);
}

export async function editarInsumo(id, dados) {
    const ref = doc(dbRefs.insumos, id);
    await updateDoc(ref, dados);
}

export async function editarProducao(id, dados) {
    const { oldStatus, newStatus, dataEntrega } = dados;
    await runTransaction(db, async (transaction) => {
        const producaoRef = doc(db, dbRefs.producao.path, id);
        const producaoDoc = await transaction.get(producaoRef);
        if (!producaoDoc.exists()) throw new Error("Lote não encontrado.");

        if (oldStatus === newStatus) {
            transaction.update(producaoRef, { dataEntrega });
            return;
        }

        const { produtoId, qtd, custoTotal } = producaoDoc.data();

        // CENÁRIO 1: Finalizando Produção (Entra Estoque)
        if (oldStatus === 'Em Produção' && newStatus === 'Recebido') {
            const produtoRef = doc(db, dbRefs.produtos.path, produtoId);
            const produtoDoc = await transaction.get(produtoRef);
            if (!produtoDoc.exists()) throw new Error("Produto do lote não encontrado.");

            const { qtdEstoque: oldQtd = 0, custoUnitario: oldCusto = 0 } = produtoDoc.data();
            // Recalcula preço médio
            const novoCustoMedio = oldQtd + qtd > 0 ? ((oldCusto * oldQtd) + custoTotal) / (oldQtd + qtd) : (custoTotal / qtd);

            transaction.update(produtoRef, { qtdEstoque: increment(qtd), custoUnitario: novoCustoMedio });
        }
        // CENÁRIO 2: Revertendo Produção (Sai Estoque - Correção de erro)
        else if (oldStatus === 'Recebido' && newStatus === 'Em Produção') {
            const produtoRef = doc(db, dbRefs.produtos.path, produtoId);
            // Apenas decrementamos a quantidade. O custo médio não é revertido para evitar complexidade excessiva e erros de arredondamento.
            transaction.update(produtoRef, { qtdEstoque: increment(-qtd) });
        }

        transaction.update(producaoRef, { status: newStatus, dataEntrega });
    });
}