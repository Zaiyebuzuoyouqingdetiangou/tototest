import { readLocalWorldBookFile } from './fileReader.js?rmv=1.5.18-audit1c2';
import { getSettings, updateSettings } from '../settings.js?rmv=1.5.18-audit1c2';
import { listHostWorldBooks, readHostWorldBook } from './hostReader.js?rmv=1.5.18-audit1c2';
import { searchNormalizedWorldBookEntries } from './normalize.js?rmv=1.5.18-audit1c2';
import {
    EXTERNAL_WORLD_BOOK_SELECTION_MODE,
    createEmptySelection,
    createFilteredSelection,
    createWholeBookSelection,
    entryIdentity,
    toggleEntrySelection,
} from './selectionState.js?rmv=1.5.18-audit1c2';
import {
    EXTERNAL_WORLD_BOOK_CLASSIFICATION,
    createExternalWorldBookClassificationDraft,
    externalWorldBookClassificationCounts,
    updateExternalWorldBookDraftItem,
} from './classifier.js?rmv=1.5.18-audit1c2';
import {
    deleteExternalLibrary,
    listExternalLibraries,
    prepareExternalLibrarySnapshot,
    saveExternalLibrarySnapshot,
    setExternalLibraryEnabled,
    hydrateExternalPoolMetadata,
    getExternalPoolHydrationStatus,
    rebuildExternalPoolMetadata,
} from './store.js?rmv=1.5.18-audit1c2';

const MODAL_ID = 'rh_external_worldbook_import_modal';
const PAGE_SIZE = 50;
const CLASSIFICATION_PAGE_SIZE = 40;
let state = null;

const CLASSIFICATION_LABELS = Object.freeze({
    [EXTERNAL_WORLD_BOOK_CLASSIFICATION.THEME]: '主题元素',
    [EXTERNAL_WORLD_BOOK_CLASSIFICATION.FORMAT]: '展现形式',
    [EXTERNAL_WORLD_BOOK_CLASSIFICATION.MIXED]: '混合型',
    [EXTERNAL_WORLD_BOOK_CLASSIFICATION.AUXILIARY]: '辅助片段',
    [EXTERNAL_WORLD_BOOK_CLASSIFICATION.IGNORE]: '忽略',
    [EXTERNAL_WORLD_BOOK_CLASSIFICATION.PENDING]: '待确认',
});

const CONFIDENCE_LABELS = Object.freeze({ high: '高', medium: '中', low: '低' });

function el(tag, options = {}) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.type) node.type = options.type;
    if (options.placeholder) node.placeholder = options.placeholder;
    if (options.value !== undefined) node.value = String(options.value);
    if (options.id) node.id = options.id;
    if (options.attrs) for (const [key, value] of Object.entries(options.attrs)) node.setAttribute(key, String(value));
    if (options.style) Object.assign(node.style, options.style);
    return node;
}

function button(text, onClick, style = {}) {
    const node = el('button', { className: 'menu_button', text, type: 'button', style });
    node.addEventListener('click', onClick);
    return node;
}

function setStatus(message, tone = '') {
    if (!state?.status) return;
    state.status.textContent = (tone === 'error' ? '⚠️ ' : '') + String(message || '');
    state.status.dataset.tone = tone;
    state.status.style.color = ''; // Inherit the host contrast in both light and dark themes.
}

function invalidateClassification() {
    if (!state) return;
    state.classificationDraft = [];
    state.classificationPage = 0;
    if (state.classificationPanel) state.classificationPanel.style.display = 'none';
}

function resetBookView() {
    state.currentBook = null;
    state.filteredEntries = [];
    state.page = 0;
    state.selectedIds.clear();
    state.selectionMode = EXTERNAL_WORLD_BOOK_SELECTION_MODE.WHOLE;
    state.entrySearch.value = '';
    state.fullText.checked = false;
    invalidateClassification();
    renderEntries();
}

function renderBookList() {
    const query = state.bookSearch.value.trim().toLocaleLowerCase('zh-Hans-CN');
    const rows = state.hostBooks.filter(item => !query || `${item.displayName}\n${item.fileId}`.toLocaleLowerCase('zh-Hans-CN').includes(query));
    state.bookList.replaceChildren();
    if (!rows.length) {
        state.bookList.append(el('div', { text: '没有匹配的酒馆世界书。', style: { opacity: '.65', fontSize: '12px', padding: '8px 2px' } }));
        return;
    }
    for (const item of rows) {
        const row = el('button', {
            className: 'menu_button',
            type: 'button',
            style: { width: '100%', textAlign: 'left', padding: '8px 9px', margin: '3px 0', minHeight: '42px' },
        });
        row.append(el('div', { text: item.displayName, style: { fontWeight: '700', overflowWrap: 'anywhere' } }));
        if (item.fileId !== item.displayName) row.append(el('div', { text: item.fileId, style: { opacity: '.55', fontSize: '10px', overflowWrap: 'anywhere' } }));
        row.addEventListener('click', async () => {
            setStatus(`正在读取「${item.displayName}」…`);
            try {
                const book = await readHostWorldBook(item);
                showNormalizedBook(book);
                setStatus(`已读取 ${book.entryCount} 条；源世界书未被修改。`, 'success');
            } catch (error) {
                resetBookView();
                setStatus(String(error?.message || error), 'error');
            }
        });
        state.bookList.append(row);
    }
}

function updateSelectionMeta() {
    const book = state?.currentBook;
    if (!book || !state?.entryMeta) return;
    const filteredCount = Array.isArray(state.filteredEntries) ? state.filteredEntries.length : 0;
    const modeLabel = state.selectionMode === EXTERNAL_WORLD_BOOK_SELECTION_MODE.WHOLE ? '整本' : state.selectionMode === EXTERNAL_WORLD_BOOK_SELECTION_MODE.FILTERED ? '筛选' : '手动';
    state.entryMeta.textContent = `${book.sourceName}｜${book.entryCount} 条｜当前匹配 ${filteredCount} 条｜已选 ${state.selectedIds.size} 条｜${modeLabel}`;
}

function selectWholeBook() {
    const book = state?.currentBook;
    if (!book) return;
    const selection = createWholeBookSelection(book);
    state.selectedIds = selection.selectedIds;
    state.selectionMode = selection.mode;
    invalidateClassification();
    updateSelectionMeta();
    renderEntries();
    setStatus(`已选择整本「${book.sourceName}」共 ${book.entryCount} 条。下一阶段将进行分类与保存。`);
}

function selectCurrentFilter() {
    const book = state?.currentBook;
    if (!book) return;
    const matches = searchNormalizedWorldBookEntries(book, state.entrySearch.value, { fullContent: state.fullText.checked });
    const selection = createFilteredSelection(matches);
    state.selectedIds = selection.selectedIds;
    state.selectionMode = selection.mode;
    state.filteredEntries = matches;
    invalidateClassification();
    updateSelectionMeta();
    renderEntries();
    setStatus(`已选择当前筛选结果 ${matches.length} 条。`);
}

function clearSelection() {
    if (!state?.currentBook) return;
    const selection = createEmptySelection();
    state.selectedIds = selection.selectedIds;
    state.selectionMode = selection.mode;
    invalidateClassification();
    updateSelectionMeta();
    renderEntries();
    setStatus('已清空当前选择。');
}

function renderEntries() {
    state.entryList.replaceChildren();
    const book = state.currentBook;
    if (!book) {
        state.entryMeta.textContent = '尚未读取世界书。';
        state.pager.textContent = '';
        return;
    }
    const query = state.entrySearch.value;
    const matches = searchNormalizedWorldBookEntries(book, query, { fullContent: state.fullText.checked });
    state.filteredEntries = matches;
    const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    state.page = Math.max(0, Math.min(state.page, pageCount - 1));
    const start = state.page * PAGE_SIZE;
    const rows = matches.slice(start, start + PAGE_SIZE);
    updateSelectionMeta();

    if (!rows.length) {
        const fallback = book.entries.every(entry => !entry.primaryKeywords.length && !entry.secondaryKeywords.length)
            ? '没有匹配结果。这本书的条目没有触发关键词时，可尝试按名称或正文搜索。'
            : '没有匹配结果，请尝试其它名称、关键词或正文词。';
        state.entryList.append(el('div', { text: fallback, style: { opacity: '.68', fontSize: '12px', padding: '10px 2px' } }));
    }

    for (const entry of rows) {
        const row = el('label', { style: { display: 'grid', gridTemplateColumns: '26px minmax(0,1fr)', gap: '8px', padding: '9px 4px', borderBottom: '1px solid color-mix(in srgb,currentColor 10%,transparent)', alignItems: 'start' } });
        const check = el('input', { type: 'checkbox' });
        const identity = entryIdentity(entry);
        check.checked = state.selectedIds.has(identity);
        check.addEventListener('change', () => {
            state.selectedIds = toggleEntrySelection(state.selectedIds, identity, check.checked);
            state.selectionMode = EXTERNAL_WORLD_BOOK_SELECTION_MODE.MANUAL;
            invalidateClassification();
            updateSelectionMeta();
        });
        row.append(check);
        const body = el('div');
        body.append(el('div', { text: entry.title, style: { fontWeight: '700', fontSize: '12px', overflowWrap: 'anywhere' } }));
        const keys = [...entry.primaryKeywords, ...entry.secondaryKeywords];
        const details = [];
        if (entry.sourceEntryUid !== null) details.push(`uid ${entry.sourceEntryUid}`);
        if (entry.disabled) details.push('源条目已停用');
        if (entry.constant) details.push('常驻');
        details.push(keys.length ? `关键词 ${keys.slice(0, 5).join(' / ')}` : '无触发关键词');
        body.append(el('div', { text: details.join('｜'), style: { opacity: '.62', fontSize: '10px', lineHeight: '1.4', marginTop: '2px', overflowWrap: 'anywhere' } }));
        if (entry.previewText) body.append(el('div', { text: entry.previewText, style: { marginTop: '5px', opacity: '.82', fontSize: '11px', lineHeight: '1.5', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }));
        row.append(body);
        state.entryList.append(row);
    }

    state.pager.replaceChildren();
    const prev = button('上一页', () => { state.page -= 1; renderEntries(); }, { minHeight: '32px' });
    const next = button('下一页', () => { state.page += 1; renderEntries(); }, { minHeight: '32px' });
    prev.disabled = state.page <= 0;
    next.disabled = state.page >= pageCount - 1;
    state.pager.append(prev, el('span', { text: `第 ${state.page + 1} / ${pageCount} 页`, style: { opacity: '.68', fontSize: '11px', alignSelf: 'center' } }), next);
}

function showNormalizedBook(book) {
    state.currentBook = book;
    state.page = 0;
    const selection = createWholeBookSelection(book);
    state.selectedIds = selection.selectedIds;
    state.selectionMode = selection.mode;
    state.entrySearch.value = '';
    state.fullText.checked = false;
    invalidateClassification();
    renderEntries();
}

async function loadHostBooks() {
    setStatus('正在读取酒馆世界书列表…');
    state.hostBooks = [];
    state.bookList.replaceChildren();
    try {
        state.hostBooks = await listHostWorldBooks();
        renderBookList();
        setStatus(`已找到 ${state.hostBooks.length} 本酒馆世界书。`, 'success');
    } catch (error) {
        setStatus(String(error?.message || error), 'error');
        state.bookList.append(el('div', { text: '酒馆来源不可用时，仍可使用本地 JSON 导入。', style: { opacity: '.68', fontSize: '12px', padding: '8px 2px' } }));
    }
}

async function loadLocalFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    setStatus(`正在读取 ${list.length} 个本地 JSON…`);
    const books = [];
    const failures = [];
    for (const file of list) {
        try { books.push(await readLocalWorldBookFile(file)); }
        catch (error) { failures.push(`${file?.name || '未命名文件'}：${String(error?.message || error)}`); }
    }
    state.localBooks = books;
    state.localBookList.replaceChildren();
    for (const book of books) {
        const row = button(`${book.sourceName}（${book.entryCount} 条）`, () => {
            showNormalizedBook(book);
            setStatus(`已读取本地世界书「${book.sourceName}」。`, 'success');
        }, { width: '100%', textAlign: 'left', minHeight: '40px', margin: '3px 0' });
        state.localBookList.append(row);
    }
    if (!books.length) state.localBookList.append(el('div', { text: '没有成功读取的本地世界书。', style: { opacity: '.65', fontSize: '12px', padding: '8px 2px' } }));
    setStatus(failures.length ? `成功 ${books.length} 个；失败 ${failures.length} 个。${failures[0] ? ` ${failures[0]}` : ''}` : `已读取 ${books.length} 个本地世界书。`, failures.length ? 'error' : 'success');
}

function classificationRowsForView() {
    const draft = Array.isArray(state?.classificationDraft) ? state.classificationDraft : [];
    const mode = state?.classificationFilter?.value || 'review';
    if (mode === 'all') return draft;
    if (mode === 'review') return draft.filter(item => item.classification === EXTERNAL_WORLD_BOOK_CLASSIFICATION.PENDING || item.requiresReview);
    return draft.filter(item => item.classification === mode);
}

function renderClassification() {
    if (!state?.classificationPanel) return;
    const draft = Array.isArray(state.classificationDraft) ? state.classificationDraft : [];
    const counts = externalWorldBookClassificationCounts(draft);
    state.classificationMeta.textContent = `待保存 ${counts.total} 条｜主题 ${counts.theme}｜展现形式 ${counts.format}｜辅助 ${counts.auxiliary}｜忽略 ${counts.ignore}｜待确认 ${counts.pending}`;
    const rows = classificationRowsForView();
    const pageCount = Math.max(1, Math.ceil(rows.length / CLASSIFICATION_PAGE_SIZE));
    state.classificationPage = Math.max(0, Math.min(state.classificationPage, pageCount - 1));
    const start = state.classificationPage * CLASSIFICATION_PAGE_SIZE;
    const pageRows = rows.slice(start, start + CLASSIFICATION_PAGE_SIZE);
    state.classificationList.replaceChildren();

    if (!pageRows.length) {
        state.classificationList.append(el('div', { text: '当前筛选下没有需要显示的条目。', style: { opacity: '.65', fontSize: '12px', padding: '10px 2px' } }));
    }

    for (const item of pageRows) {
        const row = el('div', { style: { padding: '10px 4px', borderBottom: '1px solid color-mix(in srgb,currentColor 10%,transparent)' } });
        const top = el('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(128px,180px)', gap: '8px', alignItems: 'center' } });
        const label = el('div');
        label.append(el('div', { text: item.localTitle || item.sourceTitle, style: { fontWeight: '700', fontSize: '12px', overflowWrap: 'anywhere' } }));
        label.append(el('div', {
            text: `建议：${CLASSIFICATION_LABELS[item.suggestion] || item.suggestion}｜置信度：${CONFIDENCE_LABELS[item.confidence] || item.confidence}${item.reasons?.length ? `｜${item.reasons[0]}` : ''}`,
            style: { opacity: '.65', fontSize: '10px', marginTop: '2px', lineHeight: '1.4', overflowWrap: 'anywhere' },
        }));
        const select = el('select', { className: 'text_pole', style: { width: '100%', minHeight: '36px', boxSizing: 'border-box' } });
        for (const value of [
            EXTERNAL_WORLD_BOOK_CLASSIFICATION.PENDING,
            EXTERNAL_WORLD_BOOK_CLASSIFICATION.THEME,
            EXTERNAL_WORLD_BOOK_CLASSIFICATION.FORMAT,
            EXTERNAL_WORLD_BOOK_CLASSIFICATION.AUXILIARY,
            EXTERNAL_WORLD_BOOK_CLASSIFICATION.IGNORE,
        ]) {
            const option = el('option', { text: CLASSIFICATION_LABELS[value], value });
            option.value = value;
            select.append(option);
        }
        select.value = item.classification;
        select.addEventListener('change', () => {
            state.classificationDraft = updateExternalWorldBookDraftItem(state.classificationDraft, item.entryIdentity, { classification: select.value, userConfirmed: true });
            renderClassification();
        });
        top.append(label, select);
        row.append(top);

        if (item.classification === EXTERNAL_WORLD_BOOK_CLASSIFICATION.PENDING || item.requiresReview) {
            const titleInput = el('input', { className: 'text_pole', type: 'text', value: item.localTitle, placeholder: '本地显示标题', style: { width: '100%', marginTop: '7px', boxSizing: 'border-box' } });
            const summaryInput = el('textarea', { className: 'text_pole', value: item.summary, placeholder: '本地短摘要', style: { width: '100%', marginTop: '6px', minHeight: '58px', resize: 'vertical', boxSizing: 'border-box' } });
            titleInput.addEventListener('change', () => {
                state.classificationDraft = updateExternalWorldBookDraftItem(state.classificationDraft, item.entryIdentity, { localTitle: titleInput.value, userConfirmed: true });
            });
            summaryInput.addEventListener('change', () => {
                state.classificationDraft = updateExternalWorldBookDraftItem(state.classificationDraft, item.entryIdentity, { summary: summaryInput.value, userConfirmed: true });
            });
            row.append(titleInput, summaryInput);
        }
        state.classificationList.append(row);
    }

    state.classificationPager.replaceChildren();
    const prev = button('上一页', () => { state.classificationPage -= 1; renderClassification(); }, { minHeight: '32px' });
    const next = button('下一页', () => { state.classificationPage += 1; renderClassification(); }, { minHeight: '32px' });
    prev.disabled = state.classificationPage <= 0;
    next.disabled = state.classificationPage >= pageCount - 1;
    state.classificationPager.append(prev, el('span', { text: `第 ${state.classificationPage + 1} / ${pageCount} 页`, style: { opacity: '.68', fontSize: '11px', alignSelf: 'center' } }), next);
}

function startClassificationReview() {
    const book = state?.currentBook;
    if (!book) { setStatus('请先读取一本世界书。', 'error'); return; }
    if (!state.selectedIds.size) { setStatus('当前没有选中的条目。', 'error'); return; }
    state.classificationDraft = createExternalWorldBookClassificationDraft(book, state.selectedIds);
    state.classificationPage = 0;
    state.classificationFilter.value = 'review';
    state.classificationPanel.style.display = '';
    renderClassification();
    setStatus(`已本地分析 ${state.classificationDraft.length} 条；高置信度结果已预填，混合型和不确定项保持待确认。`);
    try { state.classificationPanel.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch {}
}

async function saveClassificationReview() {
    const book = state?.currentBook;
    if (!book || !state.classificationDraft?.length) { setStatus('请先进入分类确认。', 'error'); return; }
    try {
        const snapshot = prepareExternalLibrarySnapshot(book, state.classificationDraft, { enabled: false });
        const saved = await saveExternalLibrarySnapshot(snapshot);
        const counts = externalWorldBookClassificationCounts(state.classificationDraft);
        setStatus(`已保存到兔子镜本地库：主题 ${counts.theme}、展现形式 ${counts.format}、辅助 ${counts.auxiliary}、待确认 ${counts.pending}。新库默认停用，请按需启用。`, 'success');
        await renderSavedLibraries();
        return saved;
    } catch (error) {
        setStatus(String(error?.message || error), 'error');
        return null;
    }
}

async function renderSavedLibraries() {
    if (!state?.savedLibrariesList) return;
    const owner = state;
    state.savedLibrariesList.replaceChildren();
    let libraries;
    let needsRebuild;
    try {
        libraries = await listExternalLibraries();
        await hydrateExternalPoolMetadata();
        needsRebuild = new Set(getExternalPoolHydrationStatus().metadataRebuildRequired);
    }
    catch (error) {
        if (state !== owner || !owner.overlay.isConnected) return;
        state.savedLibrariesPanel.style.display = '';
        state.savedLibrariesList.append(el('div', { text: String(error?.message || error), style: { color: '#fca5a5', fontSize: '11px', padding: '8px 2px' } }));
        return;
    }
    if (state !== owner || !owner.overlay.isConnected) return;
    state.savedLibrariesPanel.style.display = '';
    if (!libraries.length) {
        state.savedLibrariesList.append(el('div', { text: '还没有保存的外部世界书。', style: { opacity: '.65', fontSize: '11px', padding: '8px 2px' } }));
        return;
    }
    for (const library of libraries) {
        const row = el('div', { style: { padding: '9px 3px', borderBottom: '1px solid color-mix(in srgb,currentColor 10%,transparent)' } });
        row.append(el('div', { text: library.displayName, style: { fontWeight: '700', fontSize: '12px', overflowWrap: 'anywhere' } }));
        row.append(el('div', {
            text: `主题 ${library.themeCount || 0}｜展现 ${library.formatCount || 0}｜辅助 ${library.auxiliaryCount || 0}｜待确认 ${library.pendingCount || 0}｜${library.enabled ? '已启用' : '已停用'}`,
            style: { opacity: '.65', fontSize: '10px', marginTop: '3px', overflowWrap: 'anywhere' },
        }));
        const actions = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '7px' } });
        actions.append(
            button(library.enabled ? '停用' : '启用', async () => {
                try {
                    await setExternalLibraryEnabled(library.libraryId, !library.enabled);
                    await renderSavedLibraries();
                    setStatus(`已${library.enabled ? '停用' : '启用'}「${library.displayName}」。只有同时打开“外部母本参与抽签”才会用于生成。`);
                } catch (error) { setStatus(String(error?.message || error), 'error'); }
            }, { minHeight: '34px' }),
            button('删除本地库', async () => {
                if (typeof globalThis.confirm === 'function' && !globalThis.confirm(`删除兔子镜本地保存的「${library.displayName}」？`)) return;
                try {
                    await deleteExternalLibrary(library.libraryId);
                    await renderSavedLibraries();
                    setStatus(`已删除兔子镜本地保存的「${library.displayName}」。`);
                } catch (error) { setStatus(String(error?.message || error), 'error'); }
            }, { minHeight: '34px' }),
        );
        if (needsRebuild.has(library.libraryId)) {
            const rebuild = button('重建抽签索引', async () => {
                rebuild.disabled = true;
                try {
                    await rebuildExternalPoolMetadata(library.libraryId);
                    await renderSavedLibraries();
                    if (state === owner) setStatus('已重建这个本地库的抽签索引，原文未修改。', 'success');
                } catch (error) {
                    if (state === owner) setStatus(String(error?.message || error), 'error');
                } finally { rebuild.disabled = false; }
            }, { minHeight: '44px' });
            actions.append(rebuild);
            row.append(el('div', { text: '旧库需手动重建一次索引后才能抽签；只读取这个本地库，不联网。', style: { fontSize: '12px', lineHeight: '1.5', marginTop: '6px' } }));
        }
        row.append(actions);
        state.savedLibrariesList.append(row);
    }
}

function createExternalRandomControls() {
    const box = el('fieldset', { style: { border: '1px solid color-mix(in srgb,currentColor 22%,transparent)', borderRadius: '12px', padding: '10px', margin: '0 0 14px', minWidth: '0' } });
    box.append(el('legend', { text: '生成与抽签', style: { fontSize: '13px', fontWeight: '700' } }));
    const label = el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px', fontSize: '14px' } });
    const toggle = el('input', { id: 'rh_external_random_enabled', type: 'checkbox' });
    label.append(toggle, document.createTextNode('外部母本参与抽签'));
    const modeLabel = el('label', { text: '抽签偏好', attrs: { for: 'rh_external_random_mix' }, style: { display: 'block', fontSize: '13px', margin: '6px 0' } });
    const mode = el('select', { id: 'rh_external_random_mix', className: 'text_pole', style: { width: '100%', minHeight: '44px', boxSizing: 'border-box' } });
    for (const [value, text] of [['builtin-preferred', '内置优先（推荐）'], ['balanced', '内置与外部均衡'], ['external-preferred', '外部优先'], ['external-only', '仅外部（可用池不足时按现有规则回退）']]) {
        mode.append(el('option', { value, text }));
    }
    const status = el('div', { attrs: { role: 'status' }, style: { fontSize: '12px', lineHeight: '1.5', marginTop: '8px', overflowWrap: 'anywhere' } });
    const render = () => {
        const settings = getSettings();
        toggle.checked = settings.externalWorldBookRandomEnabled === true && settings.externalWorldBookMixMode !== 'builtin-only';
        mode.value = settings.externalWorldBookMixMode === 'builtin-only' ? 'builtin-preferred' : settings.externalWorldBookMixMode;
        mode.disabled = !toggle.checked;
        status.textContent = toggle.checked
            ? '已开启。请另外启用下方需要的本地库；仅发送本轮抽中的条目。'
            : '已关闭，新抽签不使用外部母本；手动重说旧面仍保留原抽签。开启也不会自动启用本地库。';
    };
    toggle.addEventListener('change', () => {
        updateSettings({ externalWorldBookRandomEnabled: toggle.checked, ...(toggle.checked ? { externalWorldBookMixMode: mode.value || 'builtin-preferred' } : {}) });
        render();
    });
    mode.addEventListener('change', () => { updateSettings({ externalWorldBookMixMode: mode.value }); render(); });
    box.append(label, modeLabel, mode, status, button('管理已保存内容', async () => {
        const owner = state;
        await renderSavedLibraries();
        if (state === owner && owner?.overlay.isConnected) {
            try { owner.savedLibrariesPanel.scrollIntoView({ block: 'start' }); } catch {}
        }
    }, { minHeight: '44px', marginTop: '8px', width: '100%' }));
    render();
    return box;
}

function createModal() {
    document.getElementById(MODAL_ID)?.remove();
    const overlay = el('div', {
        id: MODAL_ID,
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': '外部世界书母本导入' },
        style: { position: 'fixed', inset: '0', zIndex: '2147483010', background: 'rgba(8,10,14,.68)', padding: 'max(12px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    });
    const card = el('div', { style: { width: 'min(820px,100%)', maxHeight: 'min(860px,calc(100dvh - 24px))', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--SmartThemeBlurTintColor,#202226)', color: 'var(--SmartThemeBodyColor,#ddd)', border: '1px solid color-mix(in srgb,currentColor 18%,transparent)', borderRadius: '18px', boxShadow: '0 22px 70px rgba(0,0,0,.42)' } });
    const header = el('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 42px', gap: '8px', alignItems: 'center', padding: '11px 12px', borderBottom: '1px solid color-mix(in srgb,currentColor 12%,transparent)' } });
    const title = el('div');
    title.append(el('div', { text: '外部世界书母本', style: { fontWeight: '700', fontSize: '15px' } }));
    title.append(el('div', { text: '本地导入、确认分类后按需参与抽签；不修改源世界书。', style: { opacity: '.8', fontSize: '12px', marginTop: '2px' } }));
    header.append(title, button('×', () => overlay.remove(), { width: '38px', minWidth: '38px', height: '38px', padding: '0', fontSize: '20px' }));
    const scroll = el('div', { style: { padding: '12px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' } });
    scroll.append(createExternalRandomControls());

    const sourceButtons = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '8px' } });
    const hostPane = el('div', { style: { marginTop: '10px' } });
    const filePane = el('div', { style: { marginTop: '10px', display: 'none' } });
    const showPane = which => { hostPane.style.display = which === 'host' ? '' : 'none'; filePane.style.display = which === 'file' ? '' : 'none'; };
    sourceButtons.append(
        button('从酒馆已有世界书导入', () => { showPane('host'); loadHostBooks(); }, { minHeight: '44px', fontWeight: '700' }),
        button('从本地世界书文件导入', () => showPane('file'), { minHeight: '44px' }),
    );
    scroll.append(sourceButtons);

    const bookSearch = el('input', { className: 'text_pole', type: 'search', placeholder: '搜索世界书名称', style: { width: '100%', marginTop: '8px', boxSizing: 'border-box' } });
    const bookList = el('div', { style: { maxHeight: '210px', overflowY: 'auto', marginTop: '6px', padding: '4px 2px', WebkitOverflowScrolling: 'touch' } });
    bookSearch.addEventListener('input', renderBookList);
    hostPane.append(bookSearch, bookList);

    const fileInput = el('input', { type: 'file', attrs: { accept: '.json,application/json,text/json,text/plain,application/octet-stream', multiple: 'multiple' }, style: { width: '100%', marginTop: '8px' } });
    const localBookList = el('div', { style: { maxHeight: '210px', overflowY: 'auto', marginTop: '6px', padding: '4px 2px', WebkitOverflowScrolling: 'touch' } });
    fileInput.addEventListener('change', () => loadLocalFiles(fileInput.files));
    filePane.append(el('div', { text: '选择一份或多份 JSON 世界书文件。文件只在当前页面读取。', style: { opacity: '.68', fontSize: '11px', lineHeight: '1.45' } }), fileInput, localBookList);
    scroll.append(hostPane, filePane);

    const divider = el('div', { style: { borderTop: '1px solid color-mix(in srgb,currentColor 12%,transparent)', margin: '12px 0 9px' } });
    const entrySearch = el('input', { className: 'text_pole', type: 'search', placeholder: '搜索条目名称、关键词、正文或 uid', style: { width: '100%', boxSizing: 'border-box' } });
    const fullTextLabel = el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '7px', fontSize: '11px', opacity: '.78' } });
    const fullText = el('input', { type: 'checkbox' });
    fullTextLabel.append(fullText, document.createTextNode('搜索完整正文（大型世界书可能更慢）'));
    const entryMeta = el('div', { text: '尚未读取世界书。', style: { fontSize: '11px', opacity: '.66', margin: '7px 0' } });
    const selectionActions = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '7px', margin: '4px 0 8px' } });
    selectionActions.append(
        button('全选整本', selectWholeBook, { minHeight: '38px', fontWeight: '700' }),
        button('只选筛选结果', selectCurrentFilter, { minHeight: '38px' }),
        button('清空选择', clearSelection, { minHeight: '38px' }),
    );
    const selectionHint = el('div', { text: '读取世界书后默认整本选中；只需要部分内容时可搜索并点击“只选筛选结果”，也可手动取消个别条目。', style: { fontSize: '10px', opacity: '.62', lineHeight: '1.45', marginBottom: '6px' } });
    const entryList = el('div', { style: { minHeight: '120px', maxHeight: '360px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' } });
    const pager = el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '8px' } });
    let debounceId = 0;
    entrySearch.addEventListener('input', () => { clearTimeout(debounceId); debounceId = setTimeout(() => { state.page = 0; renderEntries(); }, 150); });
    fullText.addEventListener('change', () => { state.page = 0; renderEntries(); });

    const advanceActions = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '7px', marginTop: '8px' } });
    advanceActions.append(
        button('进入分类确认', startClassificationReview, { minHeight: '40px', fontWeight: '700' }),
    );
    scroll.append(divider, entrySearch, fullTextLabel, entryMeta, selectionActions, selectionHint, entryList, pager, advanceActions);

    const classificationPanel = el('div', { style: { display: 'none', borderTop: '1px solid color-mix(in srgb,currentColor 12%,transparent)', marginTop: '14px', paddingTop: '10px' } });
    classificationPanel.append(el('div', { text: '分类确认', style: { fontWeight: '700', fontSize: '13px' } }));
    classificationPanel.append(el('div', { text: '本地分类仅作建议；混合型和不确定项需确认。新库保存后默认停用，不会自动参与抽签。', style: { opacity: '.8', fontSize: '12px', lineHeight: '1.5', marginTop: '3px' } }));
    const classificationMeta = el('div', { style: { fontSize: '11px', opacity: '.72', margin: '7px 0' } });
    const classificationFilter = el('select', { className: 'text_pole', style: { width: '100%', minHeight: '36px', boxSizing: 'border-box' } });
    for (const [value, label] of [['review', '只看需确认'], ['all', '显示全部'], ['theme', '主题元素'], ['format', '展现形式'], ['auxiliary', '辅助片段'], ['ignore', '忽略'], ['pending', '待确认']]) {
        const option = el('option', { text: label, value }); option.value = value; classificationFilter.append(option);
    }
    classificationFilter.value = 'review';
    classificationFilter.addEventListener('change', () => { state.classificationPage = 0; renderClassification(); });
    const classificationList = el('div', { style: { maxHeight: '400px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', marginTop: '6px' } });
    const classificationPager = el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '8px' } });
    const saveButton = button('确认分类并保存到本地', saveClassificationReview, { width: '100%', minHeight: '42px', marginTop: '8px', fontWeight: '700' });
    classificationPanel.append(classificationMeta, classificationFilter, classificationList, classificationPager, saveButton);
    scroll.append(classificationPanel);

    const savedLibrariesPanel = el('div', { style: { display: 'none', borderTop: '1px solid color-mix(in srgb,currentColor 12%,transparent)', marginTop: '14px', paddingTop: '10px' } });
    savedLibrariesPanel.append(el('div', { text: '已保存的外部世界书', style: { fontWeight: '700', fontSize: '13px' } }));
    savedLibrariesPanel.append(el('div', { text: '仅已启用库中确认的主题与展现形式参与抽签。启用本地库不会修改上方总开关。', style: { opacity: '.8', fontSize: '12px', lineHeight: '1.5', marginTop: '3px' } }));
    const savedLibrariesList = el('div', { style: { marginTop: '5px' } });
    savedLibrariesPanel.append(savedLibrariesList);
    scroll.append(savedLibrariesPanel);

    scroll.append(el('div', { text: '跟随与独立 API 均可使用；不会发送整本世界书，也不会按面额外请求。', style: { marginTop: '10px', opacity: '.8', fontSize: '12px', lineHeight: '1.5' } }));

    const status = el('div', { text: '请选择来源。', style: { padding: '8px 12px', borderTop: '1px solid color-mix(in srgb,currentColor 12%,transparent)', fontSize: '11px', lineHeight: '1.45', minHeight: '34px', boxSizing: 'border-box' } });
    card.append(header, scroll, status);
    overlay.append(card);
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    document.body.append(overlay);

    state = {
        overlay, status, hostBooks: [], localBooks: [], currentBook: null,
        filteredEntries: [], page: 0, selectedIds: new Set(), selectionMode: EXTERNAL_WORLD_BOOK_SELECTION_MODE.WHOLE,
        classificationDraft: [], classificationPage: 0,
        bookSearch, bookList, localBookList, entrySearch, fullText, entryMeta, entryList, pager,
        classificationPanel, classificationMeta, classificationFilter, classificationList, classificationPager,
        savedLibrariesPanel, savedLibrariesList,
    };
    showPane('host');
    loadHostBooks();
}

export function openExternalWorldBookImportWizard() {
    createModal();
}
