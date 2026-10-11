import { themeSetting } from '@/server/themes';

/** `hsl(229, 100%, 64%)` -> `229 100% 64%` (components/layouts/colors.blade.php) */
function hsl(value: string): string {
    return value.replace(/^hsl\((.+)\)$/, '$1').replaceAll(',', '');
}

/** Port of layouts/colors.blade.php */
export function Head() {
    const t = (key: string, fallback: string) => hsl(String(themeSetting(key, fallback)));
    const css = `
    :root {
        /* Branding Colors (Light) */
        --color-primary: ${t('primary', '229 100% 64%')};
        --color-secondary: ${t('secondary', '237 33% 60%')};

        /* Neutral Colors - Borders, Accents... (Light) */
        --color-neutral: ${t('neutral', '220 25% 85%')};

        /* Text Colors (Light) */
        --color-base: ${t('base', '0 0% 0%')};
        --color-muted: ${t('muted', '0 0% 40%')};
        --color-inverted: ${t('inverted', '100 100% 100%')};

        /* State Colors */
        --color-success: 142 71% 45%;
        --color-error: 0 75% 60%;
        --color-warning: 25 95% 53%;
        --color-inactive: 0 0% 63%;
        --color-info: 210 100% 60%;

        /* Background Colors (Light) */
        --color-background: ${t('background', '100 100% 100%')};
        --color-background-secondary: ${t('background-secondary', '0 0% 97%')};
    }

    .dark {
        /* Branding Colors (Dark) */
        --color-primary: ${t('dark-primary', '229 100% 64%')};
        --color-secondary: ${t('dark-secondary', '237 33% 60%')};

        /* Neutral Colors - Borders, Accents... (Dark) */
        --color-neutral: ${t('dark-neutral', '0 0% 17%')};

        /* Text Colors (Dark) */
        --color-base: ${t('dark-base', '100 100% 100%')};
        --color-muted: ${t('dark-muted', '220 0% 53%')};
        --color-inverted: ${t('dark-inverted', '220 14% 60%')};

        /* Background Colors (Dark) */
        --color-background: ${t('dark-background', '240 18% 9%')};
        --color-background-secondary: ${t('dark-background-secondary', '240 13% 11%')};
    }`;
    return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
