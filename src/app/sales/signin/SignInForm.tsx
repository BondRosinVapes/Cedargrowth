'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SignInForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const res = await fetch('/api/sales/signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cedargrowth-sales': '1' },
        body: JSON.stringify({ email, password, next: nextPath }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.next === 'string') {
        router.replace(body.next);
        router.refresh();
        return;
      }
      setError(typeof body.error === 'string' ? body.error : 'That did not resolve.');
      setPending(false);
    } catch {
      setError('That did not resolve.');
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-specimen uppercase tracking-specimen text-tertiary">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="border border-hairline bg-clinical px-3 py-3 text-body-m text-primary"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-specimen uppercase tracking-specimen text-tertiary">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="border border-hairline bg-clinical px-3 py-3 text-body-m text-primary"
        />
      </label>
      {error ? <p role="alert" className="text-caption text-fail">{error}</p> : null}
      <button type="submit" disabled={pending} className="border border-ink px-4 py-3 font-mono text-specimen uppercase disabled:opacity-40">
        {pending ? 'Signing in' : 'Sign in'}
      </button>
    </form>
  );
}
