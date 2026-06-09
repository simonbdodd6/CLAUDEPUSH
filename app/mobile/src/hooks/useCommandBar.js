import { useState, useCallback, useRef } from 'react';
import { api, twin } from '../api/client.js';

const EXAMPLES = [
  'Who is injured this week?',
  'What is our attendance trend?',
  'Prepare the match pack for Saturday',
  'How many players are registered?',
  'Who hasn\'t attended in 3 weeks?',
  'Generate the weekly newsletter',
  'Show me U16 Red\'s availability',
  'What actions need approval?',
];

export function useCommandBar() {
  const [open,     setOpen]     = useState(false);
  const [query,    setQuery]    = useState('');
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [history,  setHistory]  = useState([]);
  const inputRef = useRef(null);

  const show = useCallback(() => {
    setOpen(true);
    setResult(null);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  const submit = useCallback(async (text) => {
    const q = (text ?? query).trim();
    if (!q) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await twin.ask(q) ?? await api.resolveNL(q);
      const answer = res?.answer ?? res?.result?.answer ?? res?.message ?? JSON.stringify(res);
      const entry  = { q, answer, ts: Date.now() };
      setResult(entry);
      setHistory(h => [entry, ...h.slice(0, 19)]);
    } catch (e) {
      setResult({ q, answer: `Error: ${e.message}`, ts: Date.now() });
    } finally {
      setLoading(false);
    }
  }, [query]);

  const pick = useCallback((example) => {
    setQuery(example);
    submit(example);
  }, [submit]);

  return {
    open, show, hide,
    query, setQuery,
    result, loading, history,
    submit, pick,
    examples: EXAMPLES,
    inputRef,
  };
}
