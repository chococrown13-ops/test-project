import type { GameState, Message, MessageTone } from './types';

export function pushMessage(
  state: GameState,
  from: string,
  subject: string,
  body: string,
  tone: MessageTone = 'neutral',
  link?: Message['link'],
): Message {
  const message: Message = {
    id: `m${state.counter++}`,
    day: state.day,
    from,
    subject,
    body,
    tone,
    read: false,
    link,
  };
  state.inbox.unshift(message);
  // Keep the save small: old read mail goes first.
  if (state.inbox.length > 160) {
    const keep = state.inbox.filter((m, i) => i < 120 || !m.read);
    state.inbox = keep.slice(0, 160);
  }
  return message;
}

export function nextId(state: GameState, prefix: string): string {
  return `${prefix}${state.counter++}`;
}
