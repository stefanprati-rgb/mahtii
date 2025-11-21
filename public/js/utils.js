import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const numberFormatter = new Intl.NumberFormat('pt-BR');

export const isValidDateString = (dateStr) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr);

export const parseInputDate = (dateStr) => {
    if (!dateStr || !isValidDateString(dateStr)) return null;
    const date = new Date(dateStr + 'T03:00:00Z');
    if (isNaN(date.getTime())) return null;
    return Timestamp.fromDate(date);
};

export const formatDate = (timestamp) => {
    if (!timestamp?.toDate) return '—';
    return timestamp.toDate().toLocaleDateString('pt-BR');
};

export const dateToInput = (timestamp) => {
    if (!timestamp?.toDate) return '';
    const d = timestamp.toDate();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const asNumber = (elId, allowZero = false) => {
    const val = Number((document.getElementById(elId)?.value || '0').toString().replace(',','.'));
    if(!allowZero && val <= 0) return NaN;
    return val;
};
