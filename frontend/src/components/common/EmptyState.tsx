import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  message?: string;
  icon?: React.ReactNode;
}

export default function EmptyState({ message = 'No hay datos', icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-text-muted">
      {icon || <Inbox size={48} className="mb-3 opacity-40" />}
      <p className="text-sm">{message}</p>
    </div>
  );
}
