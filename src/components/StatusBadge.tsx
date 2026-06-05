import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

const statusConfig = {
  queued: { icon: Clock, bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', label: 'Queued' },
  running: { icon: Loader2, bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', label: 'Running' },
  succeeded: { icon: CheckCircle, bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Succeeded' },
  failed: { icon: XCircle, bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', label: 'Failed' },
} as const;

interface Props {
  status: keyof typeof statusConfig;
}

export default function StatusBadge({ status }: Props) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      <Icon className={`w-3 h-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  );
}
