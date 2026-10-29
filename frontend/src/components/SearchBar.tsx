import { useRef, useState } from 'react';

export interface SearchInput {
  query: string;
  imageDataUrl?: string;
  tiktok: boolean;
  showSeen: boolean;
}

interface Props {
  busy: boolean;
  tiktokAvailable: boolean;
  showExamples: boolean;
  onSearch: (i: SearchInput) => void;
}

const EXAMPLES = ['oversized graphic tee', 'protein dark chocolate', 'insulated tumbler', 'https://www.allbirds.com/products/mens-tree-runners'];

export default function SearchBar({ busy, tiktokAvailable, showExamples, onSearch }: Props) {
  const [query, setQuery] = useState('');
  const [image, setImage] = useState<string>();
  const [fileName, setFileName] = useState('');
  const [tiktok, setTiktok] = useState(false);
  const [showSeen, setShowSeen] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (f?: File) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) return setError('Please choose a PNG, JPG, WebP or GIF image.');
    if (f.size > 5_000_000) return setError('Image is larger than 5 MB.');
    setError('');
    const r = new FileReader();
    r.onload = () => {
      setImage(r.result as string);
      setFileName(f.name);
    };
    r.readAsDataURL(f);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() && !image) return setError('Enter a product name, paste a product link, or upload a photo.');
    if (query.trim() && query.trim().length < 2) return setError('Search text is too short.');
    setError('');
    onSearch({ query: query.trim(), imageDataUrl: image, tiktok, showSeen });
  };

  return (
    <form className="searchbar card" onSubmit={submit}>
      <div className="row">
        <input
          aria-label="Product name or link"
          placeholder='Product name ("oversized graphic tee") or product link (https://…)'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy}
        />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} title="Optional: upload the product photo for exact-match scoring">
          {image ? '🖼 ' + (fileName.length > 14 ? fileName.slice(0, 12) + '…' : fileName) : '🖼 Upload photo'}
        </button>
        {image && <button type="button" title="Remove photo" onClick={() => { setImage(undefined); setFileName(''); }}>✕</button>}
        <button className="primary" disabled={busy}>{busy ? 'Searching…' : 'Find videos'}</button>
      </div>
      <div className="row options">
        <label><input type="checkbox" checked={showSeen} onChange={(e) => setShowSeen(e.target.checked)} /> Show previously seen</label>
        <label className={tiktokAvailable ? '' : 'disabled'} title={tiktokAvailable ? '' : 'Set ENABLE_TIKTOK=true on the server to use TikTok'}>
          <input type="checkbox" checked={tiktok} disabled={!tiktokAvailable} onChange={(e) => setTiktok(e.target.checked)} /> Include TikTok (optional)
        </label>
      </div>
      {showExamples && !busy && (
        <div className="examples">
          <span className="small muted">Try:</span>
          {EXAMPLES.map((ex) => (
            <button type="button" key={ex} onClick={() => setQuery(ex)}>{ex.startsWith('http') ? 'Allbirds product link' : ex}</button>
          ))}
        </div>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
    </form>
  );
}
