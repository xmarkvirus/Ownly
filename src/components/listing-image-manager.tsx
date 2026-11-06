'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { LISTING_SCREENSHOT_MAX_BYTES, LISTING_SCREENSHOT_MAX_COUNT } from '@/lib/image-validation';

type ExistingImage = { path: string; url: string };
type Item = { key: string; kind: 'existing' | 'new'; path?: string; index?: number; url: string; fileName?: string };

export function ListingImageManager({ existing = [], error }: { existing?: ExistingImage[]; error?: string }) {
  const { pending } = useFormStatus();
  const initial = useMemo(() => existing.map((image, index): Item => ({ key: `existing-${index}`, kind: 'existing', path: image.path, url: image.url })), [existing]);
  const [items, setItems] = useState<Item[]>(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState(error ? 'Some screenshots could not be saved. Review the selection and try again.' : '');
  const addFiles = (selection: FileList | null) => {
    if (!selection) return;
    const picked = [...selection];
    const nextFiles = [...files];
    const nextItems = [...items];
    for (const file of picked) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || !/\.(png|jpe?g|webp)$/i.test(file.name)) { setNotice('Use PNG, JPG, JPEG or WebP screenshots.'); continue; }
      if (file.size > LISTING_SCREENSHOT_MAX_BYTES) { setNotice('Each screenshot must be 2 MB or smaller.'); continue; }
      if (nextItems.length >= LISTING_SCREENSHOT_MAX_COUNT) { setNotice('A listing can have up to 8 screenshots.'); break; }
      const index = nextFiles.length; nextFiles.push(file);
      nextItems.push({ key: `new-${crypto.randomUUID()}`, kind: 'new', index, url: URL.createObjectURL(file), fileName: file.name });
      setNotice('');
    }
    setFiles(nextFiles); setItems(nextItems);
  };
  const move = (index: number, direction: -1 | 1) => setItems((current) => {
    const next = [...current]; const target = index + direction;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const remove = (key: string) => {
    const removed = items.find((item) => item.key === key);
    if (removed?.kind === 'new') {
      const nextFiles = files.filter((_, index) => index !== removed.index);
      setFiles(nextFiles);
      setItems((current) => current.filter((item) => item.key !== key).map((item) => item.kind === 'new' && item.index! > removed.index! ? { ...item, index: item.index! - 1 } : item));
    } else setItems((current) => current.filter((item) => item.key !== key));
  };
  const order = items.map((item) => item.kind === 'existing' ? `existing:${item.path}` : `new:${item.index}`).join('|');

  return <section className="listing-image-manager">
    <label>Screenshots (up to 8)<input className="field" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { addFiles(event.currentTarget.files); event.currentTarget.value = ''; }}/></label>
    <input type="hidden" name="image_order" value={order}/>
    {notice && <p className="alert alert-error" role="alert">{notice}</p>}
    {pending && <div className="upload-progress" role="status"><span>Uploading screenshots and saving listing…</span><progress aria-label="Saving listing and screenshots"/></div>}
    <p className="muted" style={{ fontSize: 12, margin: 0 }}>PNG, JPG or WebP · up to 2 MB each. Reorder with the arrows; remove any screenshot before saving.</p>
    {items.length > 0 && <div className="listing-image-thumbnails">{items.map((item, index) => <div className="listing-image-thumb" key={item.key}>
      <Image src={item.url} alt={item.fileName ?? `Listing screenshot ${index + 1}`} fill unoptimized sizes="120px"/>
      <div className="listing-image-controls"><button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move screenshot earlier">↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Move screenshot later">↓</button><button type="button" onClick={() => remove(item.key)} aria-label="Remove screenshot">×</button></div>
    </div>)}</div>}
    {/* Set the selected File objects on the named input so Server Actions receive the uploads. */}
    <input type="file" name="images" multiple hidden ref={(node) => {
      if (node && files.length) {
        const transfer = new DataTransfer(); files.forEach((file) => transfer.items.add(file)); node.files = transfer.files;
      }
    }}/>
  </section>;
}
