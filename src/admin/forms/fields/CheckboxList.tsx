import type { ReactNode } from 'react';
import { Field } from '../Field';
import { getPath, type RenderContext } from '../Component';
import { CheckboxListControl } from '../controls-list';
import { normalizeOptions, type OptionsInput } from './Select';
import type { Fn } from '../../core/evaluate';
import { trans } from '../../context';
import type { Rule } from '@/server/validation';

/** Filament\Forms\Components\CheckboxList */
export class CheckboxList extends Field {
    protected _options: Fn<OptionsInput | null> = [];
    protected _descriptions: Fn<Record<string, string>> = {};
    protected _searchable: Fn<boolean> = false;
    protected _bulkToggleable: Fn<boolean> = false;
    protected _gridDirection: 'row' | 'col' = 'col';
    protected _disableOptionWhen?: (value: string, label: string) => boolean;
    protected _noSearchResultsMessage?: string;
    protected _searchPrompt?: string;
    protected _searchDebounce = 1000;

    options(v: Fn<OptionsInput | null>) { this._options = v; return this; }
    descriptions(v: Fn<Record<string, string>>) { this._descriptions = v; return this; }
    searchable(v: Fn<boolean> = true) { this._searchable = v; return this; }
    bulkToggleable(v: Fn<boolean> = true) { this._bulkToggleable = v; return this; }
    gridDirection(v: 'row' | 'col') { this._gridDirection = v; return this; }
    disableOptionWhen(fn: (value: string, label: string) => boolean) { this._disableOptionWhen = fn; return this; }
    noSearchResultsMessage(v: string) { this._noSearchResultsMessage = v; return this; }
    searchPrompt(v: string) { this._searchPrompt = v; return this; }
    searchDebounce(v: number) { this._searchDebounce = v; return this; }

    protected override emptyState(_rc: RenderContext) {
        return [];
    }

    protected async optionPairs(rc: RenderContext) {
        const entries = normalizeOptions(await this.ev(this._options, rc));
        return entries.flatMap((e) => ('group' in e ? e.options : [e]));
    }

    protected override async implicitRules(rc: RenderContext): Promise<Rule[]> {
        const state = getPath(rc.state, this.getStatePath(rc));
        if (!Array.isArray(state) || state.length === 0) return [];
        const known = new Set((await this.optionPairs(rc)).filter((o) => !this._disableOptionWhen?.(o.value, o.label)).map((o) => o.value));
        return state.every((v) => known.has(String(v))) ? [] : [(_v, fail) => fail(trans('validation.in', {}))];
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const descriptions = (await this.ev(this._descriptions, rc)) ?? {};
        const options = (await this.optionPairs(rc)).map((o) => ({ value: o.value, label: o.label, description: descriptions[o.value], disabled: this._disableOptionWhen?.(o.value, o.label) || undefined }));
        const control = (
            <CheckboxListControl
                path={path}
                id={`${rc.formId}.${path}`}
                options={options}
                columns={(this.getColumns() as any) ?? null}
                direction={this._gridDirection}
                disabled={await this.isDisabled(rc)}
                live={this._live}
                searchable={(await this.ev(this._searchable, rc)) === true}
                bulkToggleable={(await this.ev(this._bulkToggleable, rc)) === true}
                searchPrompt={this._searchPrompt ?? trans('filament-forms::components.select.search_prompt')}
                noSearchResultsMessage={this._noSearchResultsMessage ?? trans('filament-forms::components.select.no_search_results_message')}
                selectAllLabel={trans('filament-forms::components.checkbox_list.actions.select_all.label')}
                deselectAllLabel={trans('filament-forms::components.checkbox_list.actions.deselect_all.label')}
            />
        );
        return this.wrap(rc, control, { labelTag: 'div' });
    }
}
