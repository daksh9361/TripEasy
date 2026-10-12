import { useCallback, useRef, useState } from 'react';
import { Copy, MessageCircle, Plus, Settings2, Trash2, UserMinus, Users, X } from 'lucide-react';
import GroupChat from './GroupChat.jsx';
import { api } from '../utils/api.js';

function GroupIcon() {
  return <span className="chat-group-icon"><Users size={17}/></span>;
}

export default function ChatPage({ groups, user, selectedGroup, loading, onSelectGroup, onGroupChange, onGroupDeleted, onViewExpenses, notify }) {
  const [modal, setModal] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [groupDetailsOpen, setGroupDetailsOpen] = useState(false);
  const [groupActionBusy, setGroupActionBusy] = useState(false);
  const [error, setError] = useState('');
  const deletingGroupIdRef = useRef(null);

  const openModal = (next) => { setError(''); setCreatedCode(''); setModal(next); };

  const handleGroupAccessRevoked = useCallback((groupId, reason) => {
    const revokedGroup = groups.find((group) => group.id === groupId);
    if (!revokedGroup || (reason === 'deleted' && deletingGroupIdRef.current === groupId)) return;
    onGroupDeleted?.(groupId);
    if (selectedGroup?.id === groupId) onSelectGroup(null);
    notify(reason === 'deleted'
      ? `“${revokedGroup.name}” was deleted.`
      : `You no longer have access to “${revokedGroup.name}”.`, true);
  }, [groups, notify, onGroupDeleted, onSelectGroup, selectedGroup]);

  const createGroup = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await api('/api/groups', { method: 'POST', body: JSON.stringify({ name: groupName }) });
      onGroupChange(result.group);
      onSelectGroup(result.group);
      setGroupName('');
      setCreatedCode(result.groupCode);
      notify('Group created. Share this private code with your members.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const joinGroup = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await api('/api/groups/join', { method: 'POST', body: JSON.stringify({ code: groupCode }) });
      onGroupChange(result.group);
      onSelectGroup(result.group);
      setGroupCode(''); setModal('');
      notify(`You joined ${result.group.name}.`);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(createdCode); notify('Group code copied.'); }
    catch { setError('Could not access the clipboard. Copy the code manually.'); }
  };

  const deleteGroup = async () => {
    if (!selectedGroup?.isAdmin || groupActionBusy) return;
    if (!window.confirm(`Delete “${selectedGroup.name}”? This will permanently remove the group, its expenses, and its chat messages.`)) return;
    deletingGroupIdRef.current = selectedGroup.id;
    setGroupActionBusy(true);
    try {
      await api(`/api/groups/${selectedGroup.id}`, { method: 'DELETE' });
      onGroupDeleted(selectedGroup.id);
      setGroupDetailsOpen(false);
      notify('Group deleted.');
    } catch (requestError) { notify(requestError.message, true); }
    finally { deletingGroupIdRef.current = null; setGroupActionBusy(false); }
  };

  const removeMember = async (member) => {
    if (!selectedGroup?.isAdmin || member.role === 'admin' || groupActionBusy) return;
    if (!window.confirm(`Remove ${member.name} from “${selectedGroup.name}”? They will lose access to this group’s chat and expenses.`)) return;
    setGroupActionBusy(true);
    try {
      const result = await api(`/api/groups/${selectedGroup.id}/members/${member.id}`, { method: 'DELETE' });
      onGroupChange(result.group);
      notify(`${member.name} was removed from the group.`);
    } catch (requestError) { notify(requestError.message, true); }
    finally { setGroupActionBusy(false); }
  };

  return <section className="content-page chat-page">
    <header className="chat-page-heading">
      <div><p className="eyebrow">YOUR FRIENDS, TOGETHER</p><h1>Trip Chat</h1><p>Create a group or join your friends&apos; trip.</p></div>
      <div className="chat-page-actions"><button className="button chat-create-button" type="button" onClick={() => openModal('create')}><Plus size={17}/>Create Group</button><button className="button chat-join-button" type="button" onClick={() => openModal('join')}>Join Group</button></div>
    </header>

    <div className="chat-layout">
      <aside className="panel chat-groups-sidebar" aria-label="Your groups">
        <div className="chat-groups-title"><div><p className="eyebrow">MESSAGES</p><h2>My Groups</h2></div><span>{groups.length}</span></div>
        <div className="chat-groups-list">
          {loading ? <p className="chat-groups-empty">Loading your groups…</p> : groups.length ? groups.map((group) => <button className={`chat-group-item ${selectedGroup?.id === group.id ? 'is-selected' : ''}`} type="button" key={group.id} onClick={() => onSelectGroup(group)} aria-current={selectedGroup?.id === group.id ? 'true' : undefined}>
            <GroupIcon/><span className="chat-group-copy"><strong>{group.name}</strong><small>{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</small></span><span className="chat-group-arrow">›</span>
          </button>) : <div className="chat-groups-empty"><MessageCircle size={20}/><p>No groups yet. Create one or join with a code.</p></div>}
        </div>
      </aside>

      <section className="panel chat-conversation" aria-label="Group conversation">
        {selectedGroup ? <>
          <header className="chat-conversation-header"><GroupIcon/><div className="chat-conversation-title"><h2>{selectedGroup.name}</h2><p>{selectedGroup.members.length} {selectedGroup.members.length === 1 ? 'member' : 'members'}</p></div><button className="button chat-group-settings-button" type="button" aria-expanded={groupDetailsOpen} onClick={() => setGroupDetailsOpen((open) => !open)}><Settings2 size={15}/><span>Group details</span></button><button className="button chat-expenses-button" type="button" onClick={() => onViewExpenses(selectedGroup)}>View Expenses</button></header>
          {groupDetailsOpen && <section className="chat-group-details" aria-label="Group details"><div className="chat-group-details-title"><h3>Group members</h3><button type="button" className="icon-button" aria-label="Close group details" onClick={() => setGroupDetailsOpen(false)}><X size={16}/></button></div><ul>{selectedGroup.members.map((member) => <li key={member.id}><span>{member.name}{member.role === 'admin' && <small>Admin</small>}</span>{selectedGroup.isAdmin && member.role !== 'admin' && <button type="button" className="chat-remove-member-button" disabled={groupActionBusy} onClick={() => removeMember(member)}><UserMinus size={14}/>Remove member</button>}</li>)}</ul>{selectedGroup.isAdmin && <button type="button" className="button chat-delete-group-button" disabled={groupActionBusy} onClick={deleteGroup}><Trash2 size={15}/>{groupActionBusy ? 'Please wait…' : 'Delete Group'}</button>}</section>}
          <GroupChat groupId={selectedGroup.id} user={user} onAccessRevoked={handleGroupAccessRevoked} embedded/>
        </> : <div className="chat-no-selection"><span className="chat-no-selection-icon"><MessageCircle size={26}/></span><h2>Select a group to start chatting</h2><p>Your group messages will appear here. Create a group or join your friends&apos; trip to get started.</p><div><button className="button chat-create-button" type="button" onClick={() => openModal('create')}><Plus size={16}/>Create Group</button><button className="button chat-join-button" type="button" onClick={() => openModal('join')}>Join Group</button></div></div>}
      </section>
    </div>

    {modal && <div className="dialog-backdrop chat-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(''); }}>
      <section className="panel chat-modal" role="dialog" aria-modal="true" aria-labelledby="chat-modal-title">
        <button className="icon-button chat-modal-close" aria-label="Close dialog" type="button" disabled={busy} onClick={() => setModal('')}><X size={18}/></button>
        {modal === 'create' && !createdCode && <form onSubmit={createGroup}>
          <p className="eyebrow">START SOMETHING TOGETHER</p><h2 id="chat-modal-title">Create a group</h2><p className="chat-modal-copy">Name your trip. We&apos;ll create a private code you can share with friends.</p>
          <label className="field-label">Trip or group name<input autoFocus required maxLength="100" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Weekend in Manali"/></label>
          {error && <p className="chat-modal-error" role="alert">{error}</p>}
          <div className="chat-modal-actions"><button className="button chat-create-button" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create Group'}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setModal('')}>Cancel</button></div>
        </form>}
        {modal === 'create' && createdCode && <div>
          <p className="eyebrow">GROUP CREATED</p><h2 id="chat-modal-title">Share your group code</h2><p className="chat-modal-copy">Give this private code to friends so they can join {selectedGroup?.name || 'your group'}.</p>
          <div className="chat-created-code"><strong>{createdCode}</strong><button className="button chat-create-button" type="button" onClick={copyCode}><Copy size={15}/>Copy Code</button></div>
          {error && <p className="chat-modal-error" role="alert">{error}</p>}
          <div className="chat-modal-actions"><button className="button button-secondary" type="button" onClick={() => setModal('')}>Done</button></div>
        </div>}
        {modal === 'join' && <form onSubmit={joinGroup}>
          <p className="eyebrow">JOIN YOUR FRIENDS</p><h2 id="chat-modal-title">Enter a group code</h2><p className="chat-modal-copy">Ask a group member for their six-character invite code.</p>
          <label className="field-label">Group code<input autoFocus required minLength="6" maxLength="6" autoCapitalize="characters" value={groupCode} onChange={(event) => setGroupCode(event.target.value.toUpperCase())} placeholder="A1B2C3"/></label>
          {error && <p className="chat-modal-error" role="alert">{error}</p>}
          <div className="chat-modal-actions"><button className="button chat-create-button" type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join Group'}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setModal('')}>Cancel</button></div>
        </form>}
      </section>
    </div>}
  </section>;
}

