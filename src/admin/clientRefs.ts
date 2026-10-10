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
import * as formControlsSelect from './forms/controls-select';
import * as formActions from './forms/FormActions';
import * as formRuntime from './forms/runtime';
import * as layoutClient from './layout/client';

export const clientRefs = { actionsClient, modalClient, formControls, formControlsExtra, formControlsSelect, formActions, formRuntime, layoutClient };

/** touching the references keeps the bundler from dropping the modules */
export const touchClientRefs = () => Object.keys(clientRefs).length;
