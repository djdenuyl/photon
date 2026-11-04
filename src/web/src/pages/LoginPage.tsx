export function LoginPage() {
  const denied = new URLSearchParams(location.search).has("denied");
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <img src="/icons/icon-192.png" alt="" className="h-24 w-24 rounded-3xl" />
      <h1 className="font-display text-4xl font-semibold">Het Jaar Rond</h1>
      <p className="text-ink-2">Stijlgids en opmaak van het jaarboek. Alleen voor ons gezin.</p>
      {denied && (
        <p role="alert" className="w-full rounded-xl bg-orange/15 px-4 py-3 font-semibold text-orange">
          Dit account heeft geen toegang.
        </p>
      )}
      <a href="/api/auth/login" className="flex min-h-13 w-full items-center justify-center gap-3 rounded-xl bg-ink px-6 font-semibold text-page">
        Inloggen met Google
      </a>
    </div>
  );
}
