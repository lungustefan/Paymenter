import { DangerButton, PrimaryButton } from '../../../components/Button';

export interface AuthorizeProps {
    client: { id: string; name: string };
    scopes: { id: string; description: string }[];
    state: string;
    authToken: string;
}

/** Port of views/vendor/passport/authorize.blade.php (the OAuth consent screen) */
export default function Authorize({ client, scopes, state, authToken }: AuthorizeProps) {
    const fields = (
        <>
            <input type="hidden" name="state" value={state} />
            <input type="hidden" name="client_id" value={client.id} />
            <input type="hidden" name="auth_token" value={authToken} />
        </>
    );
    return (
        <div className="mx-auto flex flex-col gap-2 mt-4 shadow-sm px-6 sm:px-14 py-10 bg-background-secondary rounded-md xl:max-w-[60%] w-full">
            <h1 className="text-2xl">Authorization Request</h1>
            {/* Introduction */}
            <p className="mt-2">
                <strong>{client.name}</strong> is requesting permission to access your account.
            </p>

            {/* Scope List */}
            {scopes.length > 0 && (
                <div className="scopes">
                    <p>
                        <strong>This application will be able to:</strong>
                    </p>
                    <ul className="list-disc list-inside">
                        {scopes.map((scope) => (
                            <li key={scope.id}>{scope.description}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex flex-row gap-2 mt-4">
                {/* Cancel Button */}
                <form method="post" action="/oauth/authorize">
                    <input type="hidden" name="_method" value="DELETE" />
                    {fields}
                    <DangerButton type="submit" className="btn btn-danger">
                        Cancel
                    </DangerButton>
                </form>

                {/* Authorize Button */}
                <form method="post" action="/oauth/authorize">
                    {fields}
                    <PrimaryButton type="submit" className="btn btn-success btn-approve">
                        Authorize
                    </PrimaryButton>
                </form>
            </div>
        </div>
    );
}
