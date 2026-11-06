'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export function AvatarPicker({ initialUrl, displayName }: { initialUrl: string | null; displayName: string }) {
  const [preview, setPreview] = useState(initialUrl);
  const objectUrl = useRef<string | null>(null);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  return <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
    <div className="avatar" style={{ width: 76, height: 76, fontSize: 25 }}>
      {preview ? <Image src={preview} alt={`${displayName} avatar preview`} width={76} height={76} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : displayName.slice(0, 1).toUpperCase()}
    </div>
    <label>Profile picture<input className="field" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      const file = event.currentTarget.files?.[0];
      objectUrl.current = file ? URL.createObjectURL(file) : null;
      setPreview(objectUrl.current ?? initialUrl);
    }}/><span className="muted" style={{ fontSize: 11 }}>PNG, JPEG or WebP · maximum 3 MB</span></label>
  </div>;
}
