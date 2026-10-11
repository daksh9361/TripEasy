import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { io } from 'socket.io-client';
import { api } from '../utils/api.js';

function mergeMessages(current, additions) {
  const unique = new Map(current.map((message) => [message.id, message]));
  additions.forEach((message) => unique.set(message.id, message));
  return [...unique.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function displayTime(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export default function GroupChat({ groupId, user, embedded = false }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const socket = io({ withCredentials: true });
    socketRef.current = socket;
    setMessages([]); setConnected(false); setJoined(false); setLoading(true); setError('');
    socket.on('connect', () => {
      if (!mounted) return;
      setConnected(true);
      setJoined(false);
      socket.emit('group:join', { groupId }, async (result) => {
        if (!mounted) return;
        if (!result?.ok) { setJoined(false); setError(result?.error || 'Could not join group chat.'); setLoading(false); return; }
        setJoined(true);
        try {
          const history = await api(`/api/groups/${groupId}/messages`);
          if (mounted) setMessages((current) => mergeMessages(current, history.messages || []));
        } catch (historyError) {
          if (mounted) setError(historyError.message);
        } finally {
          if (mounted) setLoading(false);
        }
      });
    });
    socket.on('disconnect', () => { if (mounted) { setConnected(false); setJoined(false); } });
    socket.on('connect_error', (connectionError) => {
      if (!mounted) return;
      setConnected(false); setJoined(false); setLoading(false); setError(connectionError.message || 'Could not connect to group chat.');
    });
    socket.on('group:message', (message) => {
      if (mounted && message.groupId === groupId) setMessages((current) => mergeMessages(current, [message]));
    });
    return () => { mounted = false; socketRef.current = null; socket.removeAllListeners(); socket.disconnect(); };
  }, [groupId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = (event) => {
    event.preventDefault();
    const cleanText = text.trim();
    if (!cleanText || !joined || sending) return;
    const socket = socketRef.current;
    if (!socket) return;
    setSending(true); setError('');
    socket.timeout(5000).emit('group:message:send', { groupId, text: cleanText }, (timeoutError, result) => {
      setSending(false);
      if (timeoutError || !result?.ok) { setError(result?.error || 'Could not send your message. Try again.'); return; }
      setText('');
      if (result.message) setMessages((current) => mergeMessages(current, [result.message]));
    });
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(event);
    }
  };

  return <section className={`panel group-chat-panel ${embedded ? 'is-embedded' : ''}`}>
    <div className="group-chat-heading"><div><p className="eyebrow">GROUP MESSAGES</p><h2>Live Chat</h2></div><span className={`chat-connection ${joined ? 'is-connected' : ''}`}>{joined ? 'Connected' : connected ? 'Joining…' : 'Connecting…'}</span></div>
    <div className="group-chat-messages" ref={listRef} aria-live="polite">
      {loading ? <p className="group-chat-empty">Loading chat…</p> : messages.length ? messages.map((message) => <article className={`chat-message ${message.senderId === user.id ? 'own-message' : ''}`} key={message.id}><div className="chat-message-meta"><strong>{message.senderName}</strong><time dateTime={message.createdAt}>{displayTime(message.createdAt)}</time></div><p>{message.text}</p></article>) : <p className="group-chat-empty">No messages yet. Start the conversation.</p>}
    </div>
    {error && <p className="group-chat-error" role="status">{error}</p>}
    <form className="group-chat-compose" onSubmit={sendMessage}><label className="sr-only" htmlFor="group-chat-input">Message</label><textarea id="group-chat-input" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={handleComposerKeyDown} maxLength={2000} rows={1} placeholder="Write a message…" disabled={!joined || sending}/><button className="button button-primary" type="submit" disabled={!joined || sending || !text.trim()} aria-label="Send message">{sending ? 'Sending…' : <><Send size={15}/>Send</>}</button></form>
  </section>;
}

