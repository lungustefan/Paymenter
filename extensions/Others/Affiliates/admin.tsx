import { Resource } from '@/admin/core/Resource';
import { Schema, Toggle, TextInput } from '@/admin/forms';
import { UserComponent } from '@/admin/components/UserComponent';
import { Table } from '@/admin/tables/Table';
import { TextColumn } from '@/admin/tables/columns/TextColumn';
import { BulkActionGroup } from '@/admin/actions/Action';
import { CreateAction, DeleteAction, DeleteBulkAction, EditAction, ViewAction } from '@/admin/actions/builtin';
import { CreateRecord } from '@/admin/pages/resource/CreateRecord';
import { EditRecord } from '@/admin/pages/resource/EditRecord';
import { ListRecords } from '@/admin/pages/resource/ListRecords';
import { RelationManager } from '@/admin/resources/RelationManager';
import { OrderResource } from '@/admin/resources/OrderResource';
import { ExtensionHelper } from '@/server/extensions/helper';
import { Affiliate } from './Affiliate';
import { AffiliateOrder } from './AffiliateOrder';

const earningsText = (earnings: Record<string, number> | unknown[]) =>
    Array.isArray(earnings) || Object.keys(earnings).length === 0
        ? null
        : Object.entries(earnings)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ');

class AffiliatesRelationManager extends RelationManager {
    static override relationship = 'orders';

    override table(table: Table) {
        return table
            .recordTitleAttribute('affiliate_id')
            .columns([
                TextColumn.make('order.id'),
                TextColumn.make('earnings')
                    .formatStateUsing(async ({ record }: any) => earningsText(await (await record.rel('affiliate')).earnings()))
                    .label('Earning'),
                TextColumn.make('order.created_at').label('Created At').since().sortable().dateTimeTooltip(),
            ])
            .filters([])
            .recordActions([ViewAction.make().url(async ({ record }: any) => OrderResource.getUrl('edit', { record: await record.rel('order') })), DeleteAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }
}

/** Paymenter\Extensions\Others\Affiliates\Admin\Resources\AffiliateResource */
export class AffiliateResource extends Resource {
    static model = Affiliate;
    static slug = 'affiliates';
    static navigationIcon = 'ri-hand-coin-line';
    static activeNavigationIcon = 'ri-hand-coin-fill';
    static navigationGroup = 'Administration';

    static override form(schema: Schema) {
        return schema.components([
            Toggle.make('enabled').default(true).columnSpanFull(),
            UserComponent.make('user_id'),
            TextInput.make('code').label('Referral Code').required().minLength(5).maxLength(20).unique(Affiliate, 'code', null, true),
            TextInput.make('reward')
                .label('Affiliate Reward')
                .helperText('Percentage of the purchase amount the affiliated user would receive as a reward.')
                .placeholder(async () => String((await ExtensionHelper.getExtension('other', 'Affiliates')).config('default_reward') ?? ''))
                .numeric()
                .minValue(0)
                .maxValue(100)
                .suffix('%'),
        ]);
    }

    static override table(table: Table) {
        return table
            .columns([
                TextColumn.make('user.name').description(async ({ record }: any) => {
                    const text = earningsText(await record.earnings());
                    return text ? `Earnings - ${text}` : null;
                }),
                TextColumn.make('code').badge(),
                TextColumn.make('visitors').numeric().sortable(),
                TextColumn.make('signups').numeric().sortable(),
                TextColumn.make('created_at').label('Signed Up').since().sortable().dateTimeTooltip(),
            ])
            .filters([])
            .recordActions([EditAction.make()])
            .toolbarActions([BulkActionGroup.make([DeleteBulkAction.make()])]);
    }

    static override getRelations() {
        return [AffiliatesRelationManager];
    }

    static override getPages() {
        return { index: ListAffiliates.route('/'), edit: EditAffiliate.route('/{record}/edit') };
    }
}

class EditAffiliate extends EditRecord {
    static override resource = AffiliateResource;
    override getHeaderActions() {
        return [DeleteAction.make()];
    }
}
class ListAffiliates extends ListRecords {
    static override resource = AffiliateResource;
    override getHeaderActions() {
        return [CreateAction.make()];
    }
}
void CreateRecord;
void AffiliateOrder;

export default () => ({ resources: [AffiliateResource] });
