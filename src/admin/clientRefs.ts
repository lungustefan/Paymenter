/**
 * Server actions return React trees (live form refreshes, mounted action modals) whose client
 * components may not be on the page that triggered them. Next only knows the client components the
 * page imports, so every client module of the admin panel is referenced here and the layout touches
 * this list once per render.
 */
import * as actionsClient from './actions/client';
import * as modalClient from './actions/modal-client';
import * as formControls from './forms/controls';
import * as formControlsExtra from './forms/controls-extra';
import * as formControlsList from './forms/controls-list';
import * as formControlsRich from './forms/controls-rich';
import * as formControlsUpload from './forms/controls-upload';
import * as formControlsMarkdown from './forms/controls-markdown';
import * as formControlsColor from './forms/controls-color';
import * as formControlsRepeater from './forms/controls-repeater';
import * as formControlsSelect from './forms/controls-select';
import * as columnsClient from './tables/columns/client';
import * as formActions from './forms/FormActions';
import * as formRuntime from './forms/runtime';
import * as formLayoutClient from './forms/layout/client';
import * as layoutClient from './layout/client';
import * as widgetsClient from './widgets/client';
import * as tablesClient from './tables/client';
import * as tablesClientExtra from './tables/client-extra';
import * as updatesClient from './pages/updates-client';
import * as extensionClient from './pages/extension-client';
import * as ticketClient from './resources/ticket-client';

export const clientRefs = { actionsClient, modalClient, formControls, formControlsExtra, formControlsList, formControlsRich, formControlsUpload, formControlsMarkdown, formControlsColor, formControlsRepeater, formControlsSelect, formActions, columnsClient, formRuntime, formLayoutClient, layoutClient, widgetsClient, tablesClient, tablesClientExtra, ticketClient, updatesClient, extensionClient };

/** touching the references keeps the bundler from dropping the modules */
export const touchClientRefs = () => Object.keys(clientRefs).length;
