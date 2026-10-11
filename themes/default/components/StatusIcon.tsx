import { Ri } from '@/components/icons/Ri';
import { cn } from './cn';

/** The small coloured status square used by the service / invoice / ticket cards. */
export function StatusIcon({ tone, icon }: { tone: 'success' | 'inactive' | 'warning' | 'info'; icon?: string | null }) {
    const toneClass = {
        success: 'text-success bg-success/20',
        inactive: 'text-inactive bg-inactive/20',
        warning: 'text-warning bg-warning/20',
        info: 'text-info bg-info/20',
    }[tone];
    return <div className={cn('size-5 rounded-md p-0.5', toneClass)}>{icon ? <Ri name={icon} /> : null}</div>;
}
