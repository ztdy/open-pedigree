import { migrateDisordersToStatusModel } from 'pedigree/model/disorderStatusMigration';

/*
 * VersionUpdater is responsible for updating pedigree JSON represenatation to the current version.
 */
var VersionUpdater = Class.create( {
  initialize: function() {
    this.availableUpdates = [ { 'comment':    'group node comment representation',
      'introduced': 'May2014',
      'func':       'updateGroupNodeComments'},
    { 'comment':    'per-condition disorder status model (F1b)',
      'introduced': '0.2',
      'func':       'updateDisorderStatusModel'} ];
  },

  updateToCurrentVersion: function(pedigreeJSON) {
    for (var i = 0; i < this.availableUpdates.length; i++) {
      var update = this.availableUpdates[i];

      var updateResult = this[update.func](pedigreeJSON);

      if (updateResult !== null) {
        console.log('[update #' + i + '] [updating to ' + update.introduced + ' version] - performing ' + update.comment + ' update');
        pedigreeJSON = updateResult;
      }
    }

    return pedigreeJSON;
  },

  /* Migrates the old symbol-level carrier model to the per-condition status model (F1b).
   * The transform is a pure function in model/disorderStatusMigration.js; it already honours the
   * VersionUpdater contract (returns null when there is nothing to migrate), so this is a thin
   * adapter that just exposes it as an update method.
   */
  updateDisorderStatusModel: function(pedigreeJSON) {
    return migrateDisordersToStatusModel(pedigreeJSON);
  },

  /* - assumes input is in the pre-May-2014 format
     * - returns true if there was a change
     */
  updateGroupNodeComments: function(pedigreeJSON) {
    var change = false;
    var data = JSON.parse(pedigreeJSON);
    for (var i = 0; i < data.GG.length; i++) {
      var node = data.GG[i];

      // Relationship/childhub nodes carry a `prop` key whose value is null; only person nodes have
      // a real properties object. Guarding on `node.prop` (not just the key's presence) keeps this
      // pre-2014 migration from dereferencing null — otherwise opening any pedigree that contains a
      // childhub throws "Cannot read properties of null (reading 'hasOwnProperty')".
      if (node && node.prop) {
        if (node.prop.hasOwnProperty('numPersons') && !node.prop.hasOwnProperty('comments') && node.prop.hasOwnProperty('fName') && node.prop.hasOwnProperty('fName') != '') {
          node.prop['comments'] = node.prop.fName;
          delete node.prop.fName;
          change = true;
        }
      }
    }

    if (!change) {
      return null;
    }

    return JSON.stringify(data);
  }
});

export default VersionUpdater;
