// /boek/:year — this year's book (editable), an earlier Albelli book (read-only) or a new year.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { BookViewer, type Slide } from "@/components/BookViewer";
import { useIsDesktop } from "@/components/Shell";
import { renderSurface, type AlbelliBook, type AlbelliPhoto } from "@/lib/albelli";
import { fetchJson } from "@/lib/api";
import { YEAR } from "@/lib/data";
import { BookPage } from "./BookPage";

export function YearPage() {
  const year = Number(useParams().year ?? YEAR);
  if (year === YEAR) return <BookPage />;
  return <AlbelliYear year={year} />;
}

function useAlbelli() {
  return useQuery({
    queryKey: ["albelli"],
    queryFn: async () => {
      const [books, photos] = await Promise.all([
        fetchJson<AlbelliBook[]>("/data/albelli/books.json"),
        fetchJson<Record<string, AlbelliPhoto>>("/data/albelli/photos.json"),
      ]);
      return { books, photos };
    },
    staleTime: Infinity,
  });
}

function AlbelliYear({ year }: { year: number }) {
  const albelli = useAlbelli();
  const desktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const parts = albelli.data?.books.filter((b) => b.name.startsWith(String(year))) ?? [];
  const deel = Math.min(Number(params.get("deel") ?? 1), Math.max(1, parts.length));
  const data = albelli.data;
  const slides = useMemo<Slide[]>(() => {
    const book = data?.books.filter((b) => b.name.startsWith(String(year)))[deel - 1];
    if (!book || !data) return [];
    const photos = data.photos;
    return book.surfaces.flatMap((s): Slide[] => {
      const label = s.target === "cover" ? "Omslag" : s.target === "page" ? `Pagina ${s.label}` : s.label;
      if (!desktop && s.target !== "page") {
        return (["left", "right"] as const).map((half) => ({
          label: `${label} · ${half === "left" ? "links" : "rechts"}`, title: book.name, aspect: s.w / 2 / s.h,
          html: () => renderSurface(s, photos, half),
        }));
      }
      return [{ label, title: book.name, aspect: s.w / s.h, html: () => renderSurface(s, photos) }];
    });
  }, [data, year, deel, desktop]);
  const slide = Math.min(Number(params.get("s") ?? 0) || 0, Math.max(0, slides.length - 1));
  const go = (i: number, d = deel) => {
    const next = new URLSearchParams(params);
    next.set("deel", String(d));
    next.set("s", String(i));
    setParams(next, { replace: true });
  };

  if (albelli.isPending) return <p className="p-6 text-muted">Boek laden…</p>;
  if (!parts.length) return <NewYear year={year} />;
  return (
    <div className="mx-auto max-w-[1280px] px-3 pt-3 md:px-6 md:pt-5">
      <BookViewer
        slides={slides}
        index={slide}
        onIndex={go}
        toolbar={
          <>
            {parts.length > 1 && (
              <div className="flex rounded-full bg-surface p-1 ring-1 ring-hair">
                {parts.map((b, i) => (
                  <button key={b.slug} type="button" aria-pressed={i + 1 === deel} onClick={() => go(0, i + 1)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${i + 1 === deel ? "bg-ink text-page" : "text-ink-2"}`}>
                    Deel {i + 1}
                  </button>
                ))}
              </div>
            )}
            <span className="rounded-full border border-hair px-3 py-1.5 text-xs text-muted">Albelli · alleen bekijken</span>
          </>
        }
      />
    </div>
  );
}

function NewYear({ year }: { year: number }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <h1 className="font-display text-4xl font-semibold">{year}</h1>
      <p className="mt-3 text-ink-2">Dit jaar is aangemaakt, maar er zijn nog geen foto's. Zo begin je:</p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-ink-2">
        <li>Download het album uit Google Foto's (en de WhatsApp-foto's) naar <code>data/{year}/originals/</code>.</li>
        <li>Draai de pijplijn (<code>docs/pipeline.md</code>): inlezen, ontdubbelen, gebeurtenissen, labels.</li>
        <li>Upload met <code>scripts/sync_data.py</code>; daarna verschijnt hier het boek.</li>
      </ol>
    </div>
  );
}
