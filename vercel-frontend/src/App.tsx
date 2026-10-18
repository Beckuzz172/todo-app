
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, Check, CheckCheck, ChevronDown, ChevronRight,
  Circle, CircleCheck, CircleHelp, CirclePlus, Clock3, CloudCheck, GripVertical,
  LayoutDashboard, ListFilter, LoaderCircle, Pencil, Plus, RefreshCw, Search,
  Sparkles, Trash2, X,
} from "lucide-react";

type Status = "todo" | "doing" | "done";
type Priority = "low" | "medium" | "high";
type Card = {
  id: string; title: string; description: string; status: Status; priority: Priority;
  created_at: string; updated_at: string;
};
type Draft = Pick<Card, "title" | "description" | "status" | "priority">;
const columns: { id: Status; label: string; subtitle: string }[] = [
  { id: "todo", label: "To do", subtitle: "A little possibility" },
  { id: "doing", label: "Doing", subtitle: "Good things in progress" },
  { id: "done", label: "Done", subtitle: "Look how far you’ve come" },
];
const priorityLabel = { low: "Low", medium: "Medium", high: "High" };
const blankDraft = (status: Status = "todo"): Draft => ({ title: "", description: "", status, priority: "medium" });

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  if (!response.ok) {
    let detail = "We couldn’t save that change. Please try again.";
    try {
      const body = await response.json() as { error?: unknown; message?: unknown };
      if (typeof body.error === "string") detail = body.error;
      else if (typeof body.message === "string") detail = body.message;
    } catch { /* A non-JSON server error still has a useful fallback. */ }
    throw new Error(detail);
  }
  return response.status === 204 ? undefined as T : response.json();
}

function StatusIcon({ status, size = 16 }: { status: Status; size?: number }) {
  return status === "done" ? <CircleCheck size={size} /> : status === "doing" ? <Clock3 size={size} /> : <Circle size={size} />;
}

export default function Home() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [editor, setEditor] = useState<{ card?: Card } | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [deleteCard, setDeleteCard] = useState<Card | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Status | null>(null);
  const editorDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const retry = useRef<(() => void) | null>(null);

  const loadCards = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ cards: Card[] }>("/api/cards");
      setCards(result.cards);
      setLoaded(true);
      retry.current = null;
    } catch {
      setError("Your board couldn’t be loaded. Check your connection and try again.");
      retry.current = () => { void loadCards(); };
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadCards(); }, [loadCards]);
  useEffect(() => {
    if (editor) { editorDialog.current?.showModal(); titleInput.current?.focus(); }
    else editorDialog.current?.close();
  }, [editor]);
  useEffect(() => {
    if (deleteCard) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleteCard]);

  const counts = useMemo(() => ({
    todo: cards.filter(card => card.status === "todo").length,
    doing: cards.filter(card => card.status === "doing").length,
    done: cards.filter(card => card.status === "done").length,
  }), [cards]);
  const progress = cards.length ? Math.round(counts.done / cards.length * 100) : 0;
  const filtered = cards.filter(card =>
    `${card.title} ${card.description}`.toLowerCase().includes(search.toLowerCase().trim()) &&
    (priorityFilter === "all" || card.priority === priorityFilter),
  );
  const hasFilters = Boolean(search || priorityFilter !== "all");

  function openEditor(card?: Card, status: Status = "todo") {
    if (busy || loading) return;
    setDraft(card ? { title: card.title, description: card.description, status: card.status, priority: card.priority } : blankDraft(status));
    setEditor({ card });
  }

  async function mutate(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      retry.current = null;
      setAnnouncement(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Please try again.");
      retry.current = () => { void mutate(action, success); };
    } finally { setBusy(false); }
  }

  async function saveCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || busy || loading) return;
    const existing = editor?.card;
    const payload = { ...draft, title: draft.title.trim(), description: draft.description.trim() };
    await mutate(async () => {
      const { card } = await api<{ card: Card }>(existing ? `/api/cards/${existing.id}` : "/api/cards", {
        method: existing ? "PATCH" : "POST", body: JSON.stringify(payload),
      });
      setCards(current => existing ? current.map(item => item.id === card.id ? card : item) : [card, ...current]);
      setEditor(null);
    }, existing ? "Card updated." : "Card added to your board.");
  }

  function moveCard(card: Card, status: Status) {
    if (busy || loading || card.status === status) return;
    void mutate(async () => {
      const result = await api<{ card: Card }>(`/api/cards/${card.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setCards(current => current.map(item => item.id === card.id ? result.card : item));
    }, `“${card.title}” moved to ${columns.find(column => column.id === status)?.label}.`);
  }

  function removeCard() {
    if (!deleteCard || busy || loading) return;
    const card = deleteCard;
    void mutate(async () => {
      await api<void>(`/api/cards/${card.id}`, { method: "DELETE" });
      setCards(current => current.filter(item => item.id !== card.id));
      setDeleteCard(null);
    }, "Card deleted.");
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#board">Skip to board</a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Flowboard home"><span className="brand-mark"><span /><span /><span /></span>flowboard<span className="brand-period">.</span></a>
        <div className="workspace-switch"><span className="workspace-icon">F</span><div><strong>My workspace</strong><span>A little more organized.</span></div></div>
        <span className="nav-label">WORKSPACE</span>
        <a className="nav-item active" href="#board" aria-current="page"><LayoutDashboard size={17} />My board<span className="nav-count">{cards.length}</span></a>
        <div className="sidebar-overview">
          <span className="nav-label">AT A GLANCE</span>
          {columns.map(column => <div className={`overview-row ${column.id}`} key={column.id}><span className="status-dot" /><span>{column.label}</span><strong>{counts[column.id]}</strong></div>)}
        </div>
        <div className="sidebar-bottom">
          <div className="small-note"><span className="note-icon"><Sparkles size={18} /></span><h3>Small steps. Real progress.</h3><p>A little focus goes a long way. Make your next move.</p><div className="note-line" /></div>
          <button className="help-button" onClick={() => helpDialog.current?.showModal()}><CircleHelp size={17} />A quick guide<ArrowRight size={15} /></button>
          <div className="workspace-profile"><span className="profile-avatar">F</span><div><strong>Your personal space</strong><span>Built for a clearer day</span></div></div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>My board</strong></div><div className="topbar-right"><span className={`sync-state ${error ? "sync-error" : ""}`}>{loading || busy ? <LoaderCircle size={15} className="spin" /> : error ? <Circle size={14} /> : <CloudCheck size={16} />}{loading ? "Loading board" : busy ? "Saving changes" : error ? "Needs attention" : "All changes saved"}</span><span className="top-avatar" aria-hidden="true">F</span></div></header>
        <main className="main-content" id="board">
          <section className="board-heading"><div><div className="eyebrow"><span />A LITTLE FOCUS, A LOT OF POSSIBILITY</div><h1>My board<span>.</span></h1><p>Get it out of your head. Move it forward.</p></div><button className="button primary new-card" disabled={!loaded || loading || busy} onClick={() => openEditor()}><Plus size={18} />New card</button></section>
          <section className="progress-strip" aria-label="Board progress"><div className="progress-copy"><span className="progress-symbol"><CheckCheck size={20} /></span><div><strong>{cards.length === 0 ? "Every great idea starts somewhere." : progress === 100 ? "All done. Take a moment to enjoy it." : "One task at a time. You’ve got this."}</strong><p>{cards.length === 0 ? "Give it a card. Make it happen." : `${counts.done} of ${cards.length} ${cards.length === 1 ? "card" : "cards"} complete. Keep the good things moving.`}</p></div></div><div className="progress-right"><div className="progress-label"><span>Board progress</span><strong>{progress}%</strong></div><div className="progress-track" role="progressbar" aria-label="Completed cards" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div></div></section>
          <div className="board-toolbar"><div className="board-view"><LayoutDashboard size={17} /><strong>Board view</strong><span className="toolbar-divider" /><span>{hasFilters ? `${filtered.length} of ` : ""}{cards.length} {cards.length === 1 ? "card" : "cards"}</span></div><div className="board-controls"><label className="search-box"><Search size={16} /><input placeholder="Search cards..." aria-label="Search cards" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={14} /></button>}</label><label className="filter-control"><ListFilter size={16} /><select aria-label="Filter by priority" value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}><option value="all">All priorities</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option></select><ChevronDown size={13} /></label><button className="icon-button refresh-button" title="Refresh board" aria-label="Refresh board" disabled={loading || busy} onClick={() => void loadCards()}><RefreshCw size={16} className={loading ? "spin" : ""} /></button></div></div>
          {error && !editor && !deleteCard && <div className="error-banner" role="alert"><span>{error}</span><button disabled={busy || loading} onClick={() => retry.current?.()}>Try again<RefreshCw size={14} /></button></div>}
          <div className="kanban-board" aria-busy={loading || busy}>
            {columns.map(column => {
              const columnCards = filtered.filter(card => card.status === column.id);
              return <section key={column.id} className={`kanban-column ${column.id} ${dropTarget === column.id ? "drop-active" : ""}`} aria-label={`${column.label} column`}
                onDragOver={event => { if (draggedId && !busy && !loading) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(column.id); } }}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }}
                onDrop={event => { event.preventDefault(); const card = cards.find(item => item.id === draggedId); setDropTarget(null); setDraggedId(null); if (card) moveCard(card, column.id); }}>
                <div className="column-heading"><div><span className="column-status"><StatusIcon status={column.id} /></span><h2>{column.label}</h2><span className="column-count">{hasFilters ? columnCards.length : counts[column.id]}</span></div><button className="icon-button column-plus" aria-label={`Add card to ${column.label}`} disabled={!loaded || loading || busy} onClick={() => openEditor(undefined, column.id)}><Plus size={17} /></button></div>
                <div className="column-cards">
                  {loading ? <div className="card-skeleton" aria-label="Loading cards"><span /><span /><span /><div><span /><span /></div></div> : columnCards.length ? columnCards.map(card => <article className={`task-card ${draggedId === card.id ? "dragging" : ""}`} key={card.id} draggable={!busy && !loading}
                    onDragStart={event => { event.dataTransfer.setData("text/plain", card.id); event.dataTransfer.effectAllowed = "move"; setDraggedId(card.id); }} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}>
                    <div className="card-topline"><span className={`priority-badge ${card.priority}`}>{card.priority === "high" ? <ArrowUp size={12} /> : card.priority === "low" ? <ArrowDown size={12} /> : <span className="priority-medium">=</span>}{priorityLabel[card.priority]}</span><div className="card-actions"><span className="drag-handle" title="Drag to another column"><GripVertical size={16} /></span><button className="icon-button" aria-label={`Edit ${card.title}`} title="Edit card" disabled={busy || loading} onClick={() => openEditor(card)}><Pencil size={14} /></button><button className="icon-button delete-button" aria-label={`Delete ${card.title}`} title="Delete card" disabled={busy || loading} onClick={() => setDeleteCard(card)}><Trash2 size={14} /></button></div></div>
                    <button className="card-title-button" disabled={busy || loading} onClick={() => openEditor(card)}><h3>{card.title}</h3></button>{card.description && <p className="card-description">{card.description}</p>}
                    <div className="card-footer"><label className={`card-status ${card.status}`}><StatusIcon status={card.status} size={12} /><select value={card.status} aria-label={`Move ${card.title} to column`} disabled={busy || loading} onChange={event => moveCard(card, event.target.value as Status)}>{columns.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown size={11} /></label><span className="card-date" title={`Created ${new Date(card.created_at).toLocaleString()}`}>{new Date(card.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div>
                  </article>) : <div className="column-empty"><div className={`empty-art ${column.id}`} aria-hidden="true"><span className="empty-card back" /><span className="empty-card front"><StatusIcon status={column.id} size={23} /><i /><i /></span></div><h3>{hasFilters ? "No matching cards" : column.id === "todo" ? "A fresh start" : column.id === "doing" ? "Find your flow" : "Make room for wins"}</h3><p>{hasFilters ? "Try another search or priority." : column.id === "todo" ? "Ideas, plans, and little things.\nGive your first one a home." : column.id === "doing" ? "Ready to get going?\nMove a card here to start." : "The best feeling.\nFinished cards belong here."}</p>{column.id === "todo" && !hasFilters && loaded && <button className="empty-add" disabled={busy || loading} onClick={() => openEditor()}><Plus size={14} />Add your first card</button>}{hasFilters && <button className="empty-add" onClick={() => { setSearch(""); setPriorityFilter("all"); }}>Clear filters</button>}</div>}
                </div>
                <button className="add-column-card" disabled={!loaded || loading || busy} onClick={() => openEditor(undefined, column.id)}><Plus size={16} />Add card</button>
              </section>;
            })}
          </div>
          <footer className="board-footer"><span><GripVertical size={14} />Drag a card to move it, or choose its status.</span><span>Less clutter. More clarity.<span className="footer-spark">✳</span></span></footer>
        </main>
      </div>
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      <dialog ref={editorDialog} className="modal" aria-labelledby="editor-title" onCancel={event => { if (busy) event.preventDefault(); else setEditor(null); }} onClose={() => setEditor(null)}>
        <form onSubmit={saveCard}>
          <div className="modal-heading"><span className="modal-symbol"><CirclePlus size={22} /></span><button type="button" className="icon-button" aria-label="Close card editor" disabled={busy || loading} onClick={() => setEditor(null)}><X size={20} /></button></div>
          <h2 id="editor-title">{editor?.card ? "A little fine-tuning." : "Make room for an idea."}</h2><p className="modal-subtitle">{editor?.card ? "Good plans evolve. Update the details below." : "Big or small, it starts with a card."}</p>
          <label className="field">Title <span className="required">*</span><input ref={titleInput} required maxLength={160} placeholder="What would you like to work on?" value={draft.title} disabled={busy || loading} onChange={event => setDraft({ ...draft, title: event.target.value })} /><span className="field-counter">{draft.title.length}/160</span></label>
          <label className="field">Description <span className="optional">optional</span><textarea maxLength={2000} rows={4} placeholder="A few details, a next step, a bright idea..." value={draft.description} disabled={busy || loading} onChange={event => setDraft({ ...draft, description: event.target.value })} /><span className="field-counter">{draft.description.length}/2,000</span></label>
          <div className="form-row"><label className="field">Status<select value={draft.status} disabled={busy || loading} onChange={event => setDraft({ ...draft, status: event.target.value as Status })}>{columns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label><label className="field">Priority<select value={draft.priority} disabled={busy || loading} onChange={event => setDraft({ ...draft, priority: event.target.value as Priority })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div>
          {error && editor && <div className="form-error" role="alert">{error} You can try saving again.</div>}
          <div className="modal-footer"><button type="button" className="button secondary" disabled={busy || loading} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="button primary" disabled={busy || loading || !draft.title.trim()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{busy ? "Saving..." : editor?.card ? "Save changes" : "Create card"}</button></div>
        </form>
      </dialog>
      <dialog ref={deleteDialog} className="modal delete-modal" aria-labelledby="delete-title" onCancel={event => { if (busy) event.preventDefault(); else setDeleteCard(null); }} onClose={() => setDeleteCard(null)}><div className="modal-heading"><span className="modal-symbol danger"><Trash2 size={22} /></span><button className="icon-button" aria-label="Close delete confirmation" disabled={busy || loading} onClick={() => setDeleteCard(null)}><X size={20} /></button></div><h2 id="delete-title">Let this one go?</h2><p className="modal-subtitle">“{deleteCard?.title}” will be permanently deleted. This can’t be undone.</p>{error && deleteCard && <div className="form-error" role="alert">{error}</div>}<div className="modal-footer"><button autoFocus className="button secondary" disabled={busy || loading} onClick={() => setDeleteCard(null)}>Keep card</button><button className="button danger-button" disabled={busy || loading} onClick={removeCard}>{busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}{busy ? "Deleting..." : "Delete card"}</button></div></dialog>
      <dialog ref={helpDialog} className="modal help-modal" aria-labelledby="guide-title"><div className="modal-heading"><span className="modal-symbol"><Sparkles size={22} /></span><button className="icon-button" aria-label="Close guide" onClick={() => helpDialog.current?.close()}><X size={20} /></button></div><h2 id="guide-title">A little structure. More flow.</h2><p className="modal-subtitle">Your whole plan, in three simple steps.</p><ol className="guide-steps"><li><span>01</span><div><h3>Capture it in To do</h3><p>Add a card with a title, details, and a priority. Start as small as you like.</p></div></li><li><span>02</span><div><h3>Move it to Doing</h3><p>Drag your card to the next column, or use the status menu on the card.</p></div></li><li><span>03</span><div><h3>Celebrate Done</h3><p>Finish a task and move it to Done. Watch your progress grow.</p></div></li></ol><p className="guide-note">Changes save automatically after you confirm them. Your personal board is linked to this browser; clearing cookies starts a new board.</p><button className="button primary guide-close" onClick={() => helpDialog.current?.close()}>Let’s get started<ArrowRight size={16} /></button></dialog>
    </div>
  );
}
