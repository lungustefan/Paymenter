'use client';

import ServerError from '@themes/default/views/errors/ServerError';

/** `errors/500.blade.php` */
export default function Error() {
    return <ServerError />;
}
