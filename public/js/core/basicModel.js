/*! 
 * Copyright(c) 2014 Jan Blaha 
 */ 

define(["backbone", "jquery"], function (Backbone, $) {
    return Backbone.Model.extend({
        idAttribute: "_id",
        syncProvider: "jQuery",
        isModel: true,

        hasChangesSyncLastSync: function() {
            return this.lastChangedDate > this.lastSyncDate;
        },

        initialize: function() {
            var self = this;
            this.listenTo(this, "sync", function() {
                self.lastSyncDate = new Date();
            });
            this.listenTo(this, "change", function() {
                self.lastChangedDate = new Date();
            });
        },

        parse: function(data) {
            for (var key in data) {
                if (key.indexOf("@odata") > -1) {
                    delete data[key];
                }

                if (data[key]  && this.get(key) && this.get(key).isModel) {
                    this.get(key).set(this.get(key).parse(data[key], { silent: true}));
                    delete data[key]
                }
            }
            return data;
        },

        toJSON: function () {
            var self = this;
            var json = Backbone.Model.prototype.toJSON.call(this);

            $.each(json, function (name, value) {
                if (value != null && value.isModel)
                    json[name] = value.toJSON();
            });

            return json;
        },
        
        toString: function () {
            return "";
        }
    });
});


