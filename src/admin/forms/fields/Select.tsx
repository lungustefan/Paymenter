import type { ReactNode } from 'react';
import { Field } from '../Field';
import { getPath, type RenderContext } from '../Component';
import { SelectControl } from '../controls';
import { SearchableSelect, type SelectOption } from '../controls-select';
import type { Fn } from '../../core/evaluate';
import { trans } from '../../context';
import { Action } from '../../actions/Action';
import { Schema } from '../Schema';
import { BelongsToMany } from '@/server/orm/relations';
import type { Builder } from '@/server/orm';
import type { Rule } from '@/server/validation';

export type OptionPair = { value: string; label: string; disabled?: boolean };
export type OptionGroup = { group: string; options: OptionPair[] };
export type OptionEntry = OptionPair | OptionGroup;

/**
 * `options([...])`: an object (`{ a: 'A' }`), pairs (`[[1, 'One']]`, keeps the order of integer ids) or a map.
 * A nested object is an option group.
 */
export type OptionsInput = Record<string | number, string | Record<string | number, string>> | ReadonlyArray<readonly [string | number, string]> | Map<string | number, string> | ReadonlyArray<string>;

export function normalizeOptions(input: OptionsInput | null | undefined): OptionEntry[] {
    if (!input) return [];
    const entries: Array<[string | number, any]> = input instanceof Map ? [...input.entries()] : Array.isArray(input) ? (input as any[]).map((v, i) => (Array.isArray(v) ? [v[0], v[1]] : [i, v])) : Object.entries(input as Record<string, any>);
    return entries.map(([value, label]) =>
        label !== null && typeof label === 'object' && !Array.isArray(label) ? { group: String(value), options: normalizeOptions(label as any).filter((o): o is OptionPair => 'value' in o) } : { value: String(value), label: String(label) },
    );
}

const flat = (entries: OptionEntry[]): OptionPair[] => entries.flatMap((e) => ('group' in e ? e.options : [e]));

/** Filament\Forms\Components\Select */
export class Select extends Field {
    protected _options?: Fn<OptionsInput | null>;
    protected _native: Fn<boolean> = true;
    protected _searchable: Fn<boolean> = false;
    protected _multiple: Fn<boolean> = false;
    protected _preload: Fn<boolean> = false;
    protected _selectablePlaceholder: Fn<boolean> = true;
    protected _optionsLimit = 50;
    protected _searchDebounce = 1000;
    protected _relationship: { name: string; titleAttribute: string | null; modifyQuery?: (q: Builder<any>, search: string | null, ctx: any) => void; ignoreRecord: boolean } | null = null;
    protected _getSearchResultsUsing?: (ctx: any) => Promise<OptionsInput> | OptionsInput;
    protected _getOptionLabelUsing?: (ctx: any) => Promise<string | null> | string | null;
    protected _getOptionLabelsUsing?: (ctx: any) => Promise<OptionsInput> | OptionsInput;
    protected _getOptionLabelFromRecordUsing?: (record: any) => string | Promise<string>;
    protected _disableOptionWhen?: (value: string, label: string, record: any) => boolean;
    protected _noSearchResultsMessage?: string;
    protected _noOptionsMessage?: string;
    protected _searchPrompt?: string;
    protected _maxItems?: number;
    protected _createOption?: { form: ((schema: Schema) => Schema | any[]) | any[]; using?: (ctx: any) => Promise<any> | any };
    private _createOptionAction?: Action;
    protected _searchColumns?: string[];
    protected _boolean?: { trueLabel: string; falseLabel: string };

    options(v: Fn<OptionsInput | null>) { this._options = v; return this; }
    native(v: Fn<boolean> = true) { this._native = v; return this; }
    searchable(v: Fn<boolean> = true) { this._searchable = v; return this; }
    multiple(v: Fn<boolean> = true) { this._multiple = v; return this; }
    preload(v: Fn<boolean> = true) { this._preload = v; return this; }
    selectablePlaceholder(v: Fn<boolean> = true) { this._selectablePlaceholder = v; return this; }
    optionsLimit(v: number) { this._optionsLimit = v; return this; }
    searchDebounce(v: number) { this._searchDebounce = v; return this; }
    searchPrompt(v: string) { this._searchPrompt = v; return this; }
    noSearchResultsMessage(v: string) { this._noSearchResultsMessage = v; return this; }
    noOptionsMessage(v: string) { this._noOptionsMessage = v; return this; }
    maxItems(v: number) { this._maxItems = v; return this; }
    searchColumns(v: string[]) { this._searchColumns = v; return this; }
    getSearchResultsUsing(fn: (ctx: any) => Promise<OptionsInput> | OptionsInput) { this._getSearchResultsUsing = fn; return this; }
    getOptionLabelUsing(fn: (ctx: any) => Promise<string | null> | string | null) { this._getOptionLabelUsing = fn; return this; }
    getOptionLabelsUsing(fn: (ctx: any) => Promise<OptionsInput> | OptionsInput) { this._getOptionLabelsUsing = fn; return this; }
    getOptionLabelFromRecordUsing(fn: (record: any) => string | Promise<string>) { this._getOptionLabelFromRecordUsing = fn; return this; }
    disableOptionWhen(fn: (value: string, label: string, record: any) => boolean) { this._disableOptionWhen = fn; return this; }
    /** `->boolean()` */
    boolean(trueLabel?: string, falseLabel?: string, placeholder?: string) {
        this._boolean = { trueLabel: trueLabel ?? trans('filament-forms::components.select.boolean.true'), falseLabel: falseLabel ?? trans('filament-forms::components.select.boolean.false') };
        this._options = [
            ['1', this._boolean.trueLabel],
            ['0', this._boolean.falseLabel],
        ];
        this._placeholder = placeholder ?? '-';
        return this;
    }
    createOptionForm(form: ((schema: Schema) => Schema | any[]) | any[]) { this._createOption = { form, using: this._createOption?.using }; return this; }
    createOptionUsing(fn: (ctx: any) => Promise<any> | any) { this._createOption = { form: this._createOption?.form ?? [], using: fn }; return this; }

    /** `->relationship('user', 'name', fn (Builder $query) => ..., ignoreRecord: true)` */
    relationship(name?: string | null, titleAttribute?: string | null, modifyQuery?: (q: Builder<any>, search: string | null, ctx: any) => void, ignoreRecord = false) {
        this._relationship = { name: name ?? this.getName() ?? '', titleAttribute: titleAttribute ?? null, modifyQuery, ignoreRecord };
        return this;
    }

    /** `Select::getLabel()`: without a label of its own the field is named after its relationship */
    protected override defaultLabel(): string | null {
        if (!this._relationship) return super.defaultLabel();
        // `Str::kebab($relationshipName)` with the dashes turned into spaces
        const words = this._relationship.name.split('.')[0].replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase();
        return words.charAt(0).toUpperCase() + words.slice(1);
    }

    /* ---- option providers ---- */

    protected isMultiple = async (rc: RenderContext) => (await this.ev(this._multiple, rc)) === true;
    protected isSearchable = async (rc: RenderContext) => (await this.ev(this._searchable, rc)) === true;
    protected isPreloaded = async (rc: RenderContext) => (await this.ev(this._preload, rc)) === true;

    protected override async emptyState(rc: RenderContext) {
        return (await this.isMultiple(rc)) ? [] : null;
    }

    protected relatedModel(rc: RenderContext) {
        const model = rc.model ?? rc.record?.ctor;
        const def = model?.relations?.[this._relationship!.name];
        if (!def) throw new Error(`Relation "${this._relationship!.name}" is not defined on ${model?.name}`);
        return { def, related: def.related() };
    }

    /** the title column (or the `getOptionLabelFromRecordUsing` callback) of a related record */
    protected async labelOf(record: any): Promise<string> {
        if (this._getOptionLabelFromRecordUsing) return String(await this._getOptionLabelFromRecordUsing(record));
        return String(record[this._relationship!.titleAttribute!] ?? '');
    }

    protected async relationshipQuery(rc: RenderContext, search: string | null) {
        const { related } = this.relatedModel(rc);
        const q: Builder<any> = related.query();
        const key = related.primaryKey ?? 'id';
        if (this._relationship!.ignoreRecord && rc.record) q.where(key, '!=', rc.record.getKey());
        if (this._relationship!.modifyQuery) await this._relationship!.modifyQuery(q, search, this.evalCtx(rc));
        if (search) {
            const columns = this._searchColumns ?? (this._relationship!.titleAttribute ? [this._relationship!.titleAttribute] : []);
            const term = search.toLowerCase();
            if (columns.length) q.where((w: Builder<any>) => columns.forEach((c, i) => (i === 0 ? w.where(c, 'like', `%${term}%`) : w.orWhere(c, 'like', `%${term}%`))));
        }
        return { q, key };
    }

    protected async relationshipOptions(rc: RenderContext, search: string | null): Promise<OptionPair[]> {
        const { q, key } = await this.relationshipQuery(rc, search);
        if (!this._getOptionLabelFromRecordUsing && this._relationship!.titleAttribute) q.orderBy(this._relationship!.titleAttribute);
        if (search !== null || (await this.isSearchable(rc))) q.limit(this._optionsLimit);
        const records = await q.get();
        return Promise.all(records.map(async (r: any) => ({ value: String(r[key]), label: await this.labelOf(r) })));
    }

    /** the options to render / validate against (`null`: dynamic, loaded by the browser) */
    async resolveOptions(rc: RenderContext, search: string | null = null): Promise<OptionEntry[] | null> {
        if (search !== null && this._getSearchResultsUsing) return normalizeOptions(await this._getSearchResultsUsing({ ...this.evalCtx(rc), search }));
        if (this._relationship) {
            if (search !== null) return this.relationshipOptions(rc, search);
            if ((await this.isSearchable(rc)) && !(await this.isPreloaded(rc))) return null;
            return this.relationshipOptions(rc, null);
        }
        if (this._options === undefined) return [];
        const resolved = await this.ev(this._options, rc);
        let entries = normalizeOptions(resolved);
        if (search !== null) {
            const needle = search.toLowerCase();
            entries = entries
                .map((e) => ('group' in e ? { ...e, options: e.options.filter((o) => o.label.toLowerCase().includes(needle)) } : e))
                .filter((e) => ('group' in e ? e.options.length > 0 : e.label.toLowerCase().includes(needle)));
        }
        return entries;
    }

    /** label(s) of the selected value(s) when they are not among the loaded options */
    async resolveLabels(rc: RenderContext, values: Array<string | number>): Promise<OptionPair[]> {
        if (values.length === 0) return [];
        if (this._getOptionLabelsUsing) return flat(normalizeOptions(await this._getOptionLabelsUsing({ ...this.evalCtx(rc), values })));
        if (this._getOptionLabelUsing && values.length === 1) {
            const label = await this._getOptionLabelUsing({ ...this.evalCtx(rc), state: values[0] });
            return label === null || label === undefined ? [] : [{ value: String(values[0]), label: String(label) }];
        }
        if (this._relationship) {
            const { related } = this.relatedModel(rc);
            const key = related.primaryKey ?? 'id';
            const records = await related.query().whereIn(key, values as any[]).get();
            return Promise.all(records.map(async (r: any) => ({ value: String(r[key]), label: await this.labelOf(r) })));
        }
        const all = flat((await this.resolveOptions(rc)) ?? []);
        return all.filter((o) => values.map(String).includes(o.value));
    }

    /** `{ type: 'options' }` op: options for a (server side) search or the labels of values */
    async optionsFor(rc: RenderContext, search?: string, values?: Array<string | number>): Promise<NonNullable<import('../../protocol').AdminActionResult['options']>> {
        const out: NonNullable<import('../../protocol').AdminActionResult['options']> = [];
        if (values && values.length) {
            for (const o of await this.resolveLabels(rc, values)) out.push({ value: o.value, label: o.label });
            return out;
        }
        const entries = (await this.resolveOptions(rc, search ?? '')) ?? [];
        for (const e of entries) {
            if ('group' in e) for (const o of e.options) out.push({ value: o.value, label: o.label, group: e.group });
            else out.push({ value: e.value, label: e.label });
        }
        return out;
    }

    /* ---- relationships (saved after the record) ---- */

    isManyRelationship(rc: RenderContext): boolean {
        if (!this._relationship) return false;
        const { def } = this.relatedModel(rc);
        return def instanceof BelongsToMany || def.kind === 'hasMany';
    }

    /** a to-one relationship selected through the key of the related record (`configValue.id`) */
    private isNestedBelongsTo(rc: RenderContext): boolean {
        if (!this._relationship || !(this.getName() ?? '').includes('.')) return false;
        return this.relatedModel(rc).def.kind === 'belongsTo';
    }

    /** loads the ids of a to-many relationship into the form state */
    override async loadRelationshipState(rc: RenderContext, record: any, state: Record<string, any>) {
        if (!this._relationship || !record) return;
        if (this.isNestedBelongsTo(rc)) {
            const { setPath } = await import('../Component');
            const related = await record.rel(this._relationship.name);
            const key = this.relatedModel(rc).related.primaryKey ?? 'id';
            setPath(state, this.getStatePath(rc), related ? String(related[key]) : null);
            return;
        }
        if (!this.isManyRelationship(rc)) return;
        const { related } = this.relatedModel(rc);
        const key = related.primaryKey ?? 'id';
        const rows = await record.relation(this._relationship.name).get();
        const { setPath } = await import('../Component');
        setPath(state, this.getStatePath(rc), rows.map((r: any) => String(r[key])));
    }

    /** `saveRelationships()` */
    override async saveRelationships(rc: RenderContext, record: any, data: Record<string, any>) {
        if (this._relationship && this.isNestedBelongsTo(rc)) {
            // `$relationship->associate($state)`
            const value = getPath(data, this.getStatePath(rc));
            await record.update({ [(this.relatedModel(rc).def as any).foreignKey]: value === '' ? null : value });
            return;
        }
        if (!this._relationship || !this.isManyRelationship(rc)) return;
        const ids = (getPath(data, this.getStatePath(rc)) as Array<string | number> | undefined) ?? [];
        const { def } = this.relatedModel(rc);
        if (def instanceof BelongsToMany) await record.sync(this._relationship.name, ids.map((i) => (/^\d+$/.test(String(i)) ? Number(i) : i)));
    }

    override async dehydrate(rc: RenderContext, out: Record<string, any>): Promise<void> {
        // relationships selected through the related key are saved with the record, not as a column
        if (this._relationship && this.isNestedBelongsTo(rc)) return;
        // multiple selects (relationships) are saved through `saveRelationship`, not as a column
        if (this._relationship && this.isManyRelationship(rc)) {
            const { setPath } = await import('../Component');
            setPath(out, this.getStatePath(rc), getPath(rc.state, this.getStatePath(rc)) ?? []);
            return;
        }
        await super.dehydrate(rc, out);
        const { getPath: get, setPath } = await import('../Component');
        const path = this.getStatePath(rc);
        const value = get(out, path);
        if (value === '' || value === undefined) setPath(out, path, null);
    }

    protected override async implicitRules(rc: RenderContext): Promise<Rule[]> {
        const state = getPath(rc.state, this.getStatePath(rc));
        if (state === null || state === undefined || state === '' || (Array.isArray(state) && state.length === 0)) return [];
        const multiple = await this.isMultiple(rc);
        const values: Array<string | number> = multiple ? (Array.isArray(state) ? state : [state]) : [state];
        const isStatic = !this._relationship && !this._getOptionLabelUsing && !this._getOptionLabelsUsing;
        let valid: boolean;
        if (isStatic) {
            const known = new Set(flat((await this.resolveOptions(rc)) ?? []).filter((o) => !o.disabled && !(this._disableOptionWhen?.(o.value, o.label, rc.record))).map((o) => o.value));
            valid = values.every((v) => known.has(String(v)));
        } else {
            const found = await this.resolveLabels(rc, values);
            valid = found.length === new Set(values.map(String)).size;
        }
        return valid ? [] : [(_v, fail) => fail(trans('validation.in', {}))];
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const disabled = await this.isDisabled(rc);
        const multiple = await this.isMultiple(rc);
        const searchable = await this.isSearchable(rc);
        const native = !(searchable || multiple) && (await this.ev(this._native, rc)) !== false;
        const required = (await this.ev(this._required, rc)) === true && !this.isConcealed();
        const canSelectPlaceholder = (await this.ev(this._selectablePlaceholder, rc)) !== false;
        const placeholder = this._placeholder !== undefined ? await this.ev(this._placeholder, rc) : disabled ? null : trans('filament-forms::components.select.placeholder');
        const entries = await this.resolveOptions(rc);
        const hasInlinePrefix = this._inlinePrefix && (!!(await this.ev(this._prefix, rc)) || !!(await this.ev(this._prefixIcon, rc)));
        const state = getPath(rc.state, path);

        let slot: ReactNode;
        if (native) {
            const list = (entries ?? []).map((e) => ('group' in e ? { group: e.group, options: e.options.map((o) => ({ ...o, disabled: this._disableOptionWhen?.(o.value, o.label, rc.record) })) } : { ...e, disabled: this._disableOptionWhen?.(e.value, e.label, rc.record) }));
            slot = (
                <SelectControl
                    path={path}
                    live={this._live}
                    id={id}
                    options={list as any}
                    placeholder={canSelectPlaceholder ? (placeholder ?? '') : undefined}
                    disabled={disabled || undefined}
                    required={required || undefined}
                    autoFocus={this._autofocus || undefined}
                    className={['fi-select-input', hasInlinePrefix ? 'fi-select-input-has-inline-prefix' : ''].filter(Boolean).join(' ')}
                />
            );
        } else {
            const initial: SelectOption[] = [];
            const selected = multiple ? (Array.isArray(state) ? state : []) : state === null || state === undefined || state === '' ? [] : [state];
            const known = new Set(flat(entries ?? []).map((o) => o.value));
            const missing = selected.filter((v: any) => !known.has(String(v)));
            const labels = missing.length ? await this.resolveLabels(rc, missing) : [];
            for (const o of labels) initial.push({ value: o.value, label: o.label });
            slot = (
                <SearchableSelect
                    path={path}
                    id={id}
                    options={entries ?? []}
                    extraOptions={initial}
                    dynamic={entries === null || (searchable && !!this._getSearchResultsUsing) || (searchable && !!this._relationship && !(await this.isPreloaded(rc)))}
                    searchable={searchable}
                    multiple={multiple}
                    clearable={canSelectPlaceholder && !multiple}
                    placeholder={placeholder ?? ''}
                    disabled={disabled}
                    live={this._live}
                    searchDebounce={this._searchDebounce}
                    searchPrompt={this._searchPrompt ?? trans('filament-forms::components.select.search_prompt')}
                    searchingMessage={trans('filament-forms::components.select.searching_message')}
                    noSearchResultsMessage={this._noSearchResultsMessage ?? trans('filament-forms::components.select.no_search_results_message')}
                    noOptionsMessage={this._noOptionsMessage ?? trans('filament-forms::components.select.no_options_message')}
                    maxItems={this._maxItems}
                    maxItemsMessage={this._maxItems ? trans('filament-forms::components.select.max_items_message', { count: this._maxItems }) : undefined}
                    optionsLimit={this._optionsLimit}
                    disabledValues={(entries ?? []).flatMap((e) => ('group' in e ? e.options : [e])).filter((o) => this._disableOptionWhen?.(o.value, o.label, rc.record)).map((o) => o.value)}
                    selectedLabel="Clear selection"
                />
            );
        }
        const hasPrefixOrSuffix = false;
        void hasPrefixOrSuffix;
        return this.wrap(rc, await this.wrapInput(rc, slot, ['fi-fo-select', hasInlinePrefix ? 'fi-fo-select-has-inline-prefix' : '', native ? 'fi-fo-select-native' : ''].filter(Boolean).join(' ')), { className: 'fi-fo-select-wrp' });
    }

    /** the `+` button next to the select: a modal with the create form of the related resource */
    override inlineActions(kind: 'hint' | 'prefix' | 'suffix'): Action[] {
        const actions = super.inlineActions(kind);
        if (kind !== 'suffix' || !this._createOption) return actions;
        return [...actions, (this._createOptionAction ??= this.makeCreateOptionAction())];
    }

    /** the model / record the modal form works with: the related model, a new record */
    override async fieldActionContext(rc: RenderContext, action: Action): Promise<Record<string, any>> {
        if (action !== this._createOptionAction || !this._relationship) return {};
        return { model: this.relatedModel(rc).related, record: null, statePath: this.getStatePath(rc), multiple: await this.isMultiple(rc) };
    }

    private makeCreateOptionAction(): Action {
        const create = this._createOption!;
        const action = Action.make('createOption')
            .label(() => trans('filament-forms::components.select.actions.create_option.label'))
            .icon('heroicon:plus')
            .color('gray')
            .iconButton()
            .size('sm')
            .modalHeading(() => trans('filament-forms::components.select.actions.create_option.modal.heading'))
            .modalSubmitActionLabel(() => trans('filament-forms::components.select.actions.create_option.modal.actions.create.label'))
            .form(() => (typeof create.form === 'function' ? create.form(Schema.make()) : create.form))
            .action(async (ctx) => {
                let key: any;
                if (create.using) key = await create.using(ctx);
                else {
                    const Related = ctx.model;
                    const record = new Related();
                    record.fill(ctx.data ?? {});
                    await record.save();
                    if (ctx.formSchema) {
                        ctx.formRc.record = record;
                        await ctx.formSchema.saveRelationships(ctx.formRc, record, ctx.data ?? {});
                    }
                    key = record.getKey();
                }
                // the new option is selected
                const current = ctx.get(ctx.statePath, true);
                ctx.set(ctx.statePath, ctx.multiple ? [...(Array.isArray(current) ? current : []), String(key)] : String(key), true);
            });
        return action;
    }

}
