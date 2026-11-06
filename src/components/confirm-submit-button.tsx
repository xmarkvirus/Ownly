'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ConfirmSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmation: string;
  children: ReactNode;
};

export function ConfirmSubmitButton({ confirmation, onClick, children, ...props }: ConfirmSubmitButtonProps) {
  return <button {...props} onClick={(event) => {
    if (!window.confirm(confirmation)) event.preventDefault();
    onClick?.(event);
  }}>{children}</button>;
}
