import { User } from '@/server/models/User';
import { Select } from '../forms';
import type { Field } from '../forms/Field';

/** App\Admin\Components\UserComponent: the select of the user of a record, searched by name, email and id */
export class UserComponent extends Select {
    static override make<T extends Field>(this: new (key?: string | null) => T, name?: string): T {
        const select = new this(name) as unknown as UserComponent;
        select
            .label('User')
            .relationship('user', 'id')
            .searchable()
            .preload()
            .getOptionLabelFromRecordUsing((record: any) => `${record.displayName()} (${record.email})`)
            .getSearchResultsUsing(async ({ search }) => {
                const like = `%${search}%`;
                const users = await User.query()
                    .where('first_name', 'like', like)
                    .orWhere('last_name', 'like', like)
                    .orWhere('email', 'like', like)
                    .orWhere('id', 'like', like)
                    .limit(50)
                    .get();
                return Object.fromEntries(users.map((user: any) => [String(user.id), `${user.displayName()} (${user.email})`]));
            })
            .hint(({ get }) =>
                get('user_id') ? (
                    <a href={`/admin/users/${get('user_id')}/edit`} target="_blank">
                        Go to User
                    </a>
                ) : null,
            )
            .live()
            .required();
        return select as unknown as T;
    }
}
