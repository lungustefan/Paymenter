import type { ReactNode } from 'react';
import { Field } from '../Field';
import { getPath, type RenderContext } from '../Component';
import { TagsInputControl } from '../controls-list';
import type { Fn } from '../../core/evaluate';
import { trans } from '../../context';
import type { FilamentColorName } from '../../ui/colors';
import type { Rule } from '@/server/validation';

/** Filament\Forms\Components\TagsInput */
export class TagsInput extends Field {
    protected _suggestions: Fn<string[]> = [];
    protected _splitKeys: string[] = [];
    protected _color?: FilamentColorName;
    protected _tagPrefix?: string;
    protected _tagSuffix?: string;
    protected _trim = false;
    protected _separator?: string;

    suggestions(v: Fn<string[]>) { this._suggestions = v; return this; }
    splitKeys(v: string[]) { this._splitKeys = v; return this; }
    color(v: FilamentColorName) { this._color = v; return this; }
    tagPrefix(v: string) { this._tagPrefix = v; return this; }
    tagSuffix(v: string) { this._tagSuffix = v; return this; }
    trim(v = true) { this._trim = v; return this; }
    separator(v: string) { this._separator = v; this._splitKeys = [v]; return this; }
    nestedRecursiveRules(v: Rule[]) { void v; return this; }

    protected override emptyState(_rc: RenderContext) {
        return [];
    }

    protected override implicitRules(): Rule[] {
        return [];
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const disabled = await this.isDisabled(rc);
        const prefix = await this.ev(this._prefix, rc);
        const prefixIcon = await this.ev(this._prefixIcon, rc);
        const hasInlinePrefix = this._inlinePrefix && (!!prefix || !!prefixIcon);
        const suffix = await this.ev(this._suffix, rc);
        const suffixIcon = await this.ev(this._suffixIcon, rc);
        const hasInlineSuffix = this._inlineSuffix && (!!suffix || !!suffixIcon);
        const placeholder = await this.ev(this._placeholder, rc);
        const control = (
            <TagsInputControl
                path={path}
                id={`${rc.formId}.${path}`}
                disabled={disabled || undefined}
                placeholder={placeholder ?? undefined}
                className={['fi-input', hasInlinePrefix ? 'fi-input-has-inline-prefix' : '', hasInlineSuffix ? 'fi-input-has-inline-suffix' : ''].filter(Boolean).join(' ')}
                splitKeys={this._splitKeys}
                suggestions={(await this.ev(this._suggestions, rc)) ?? []}
                color={this._color ?? 'primary'}
                prefix={this._tagPrefix}
                suffix={this._tagSuffix}
                deleteLabel={trans('filament-forms::components.tags_input.actions.delete.label')}
                addedMessage={trans('filament-forms::components.tags_input.tag_added')}
                removedMessage={trans('filament-forms::components.tags_input.tag_removed')}
                live={this._live}
                autoFocus={this._autofocus || undefined}
            />
        );
        return this.wrap(rc, await this.wrapInput(rc, control, ['fi-fo-tags-input', disabled ? 'fi-disabled' : ''].filter(Boolean).join(' ')), { className: 'fi-fo-tags-input-wrp' });
    }

    override async dehydrate(rc: RenderContext, out: Record<string, any>) {
        await super.dehydrate(rc, out);
        const { setPath } = await import('../Component');
        const path = this.getStatePath(rc);
        let value = getPath(out, path);
        if (value === undefined) return;
        if (this._trim && Array.isArray(value)) value = value.map((v: string) => v.trim());
        if (value === null || value === undefined) value = [];
        setPath(out, path, value);
    }
}
