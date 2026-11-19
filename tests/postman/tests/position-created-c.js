const p = pm.response.json();
pm.collectionVariables.set('position_c_id', p.id);
pm.collectionVariables.set('position_c_version', p.version);
