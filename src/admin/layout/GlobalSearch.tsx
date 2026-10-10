import { Icon, LoadingIndicator } from '../ui/Icon';

/** `Filament\Livewire\GlobalSearch` (the results are loaded by `GlobalSearchField`) */
export function GlobalSearch() {
    return (
        <div className="fi-global-search-ctn">
            <div className="fi-global-search">
                <div className="fi-global-search-field">
                    <label className="fi-sr-only" htmlFor="global-search-input">
                        Global search
                    </label>
                    <div className="fi-input-wrp">
                        <div className="fi-input-wrp-prefix fi-input-wrp-prefix-has-content fi-inline">
                            <Icon icon="heroicon-m-magnifying-glass" />
                        </div>
                        <div className="fi-input-wrp-content-ctn">
                            <input id="global-search-input" autoComplete="off" maxLength={1000} placeholder="Search" type="search" className="fi-input fi-input-has-inline-prefix" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

void LoadingIndicator;
