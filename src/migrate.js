"use strict"
/**
 * Created by garusis on 31/01/17.
 */
import _ from "lodash"
import Promise from "bluebird"
import dh from "debug-helper"
import {appLoader} from "./utils"


export default function (argv) {
    let app = appLoader(argv.app)

    return new Promise(function (resolve, reject) {
        app.on('booted', function () {
            let specificDS = !!argv.ds.length
            let specificModels = !!argv.model.length

            if (specificModels) argv.model = _.map(argv.model, (modelName) => _.lowerCase(modelName))
            argv.ignored_model = _.map(argv.ignored_model, (modelName) => _.lowerCase(modelName))

            let datasources = _.chain(app.datasources).toArray().uniq().value() //remove duplicated datasources
            let dsByName = _.keyBy(datasources, (elem) => _.lowerCase(elem.settings.name))

            if (specificDS) {
                argv.ds = _.map(argv.ds, (dsName) => _.lowerCase(dsName))

                datasources = {}
                _.forEach(argv.ds, function (ds) { //filter to get the specific datasources
                    datasources[ds] = dsByName[ds]
                })
            } else {
                datasources = dsByName
                argv.ds = _.keys(datasources)
            }


            let modelsByDS = {}

            _.forEach(app.models, function (Model) {
                let modelName = Model.definition.name
                if (Model.dataSource) {
                    let dsName = _.lowerCase(Model.dataSource.settings.name)
                    let modelNameLower = _.lowerCase(modelName)
                    if (!datasources[dsName] || _.includes(argv.ignored_model, modelNameLower)) return

                    if (!specificModels || (specificModels && _.includes(argv.model, modelNameLower))) {
                        if (!modelsByDS[dsName]) {
                            modelsByDS[dsName] = []
                        }
                        // Why this ? When providing model name from the commandline, 
                        // creating the copy of model. resulting in table exists error
                        // 
                        /**
                        * undefined:info Starting development datasource's migration with migrate method +0ms
                             undefined:info Models to migrate ["deposit","deposit"] +0ms
                            { Error: ER_TABLE_EXISTS_ERROR: Table 'deposit' already exists
                              at Query.Sequence._packetToError (/Users/saranshsharma/Documents/wallet/node_modules/mysql/lib/protocol/sequences/Sequence.js:52:14)
                                at Query.ErrorPacket (/Users/saranshsharma/Documents/wallet/node_modules/mysql/lib/protocol/sequences/Query.js:77:18)
                                at Protocol._parsePacket (/Users/saranshsharma/Documents/wallet/node_modules/mysql/lib/protocol/Protocol.js:279:23)
                                at Parser.write (/Users/saranshsharma/Documents/wallet/node_modules/mysql/lib/protocol/Parser.js:76:12)
                                at Protocol.write (/Users/saranshsharma/Documents/wallet/node_modules/mysql/lib/protocol/Protocol.js:39:16)
                                at Socket.<anonymous> (/Users/saranshsharma/Documents/wallet/node_modules/mysql/lib/Connection.js:103:28)
                                at Socket.emit (events.js:159:13)
                                at addChunk (_stream_readable.js:265:12)
                                at readableAddChunk (_stream_readable.js:252:11)
                                at Socket.Readable.push (_stream_readable.js:209:10)
                                at TCP.onread (net.js:608:20)
                                --------------------

                        *
                        *
                        *
                        *
                        *
                        **/
                        
                      
                   
                        if (modelsByDS[dsName] == modelName){
                            modelsByDS[dsName].splice(modelName,0)
                        }else {
                        
                            modelsByDS[dsName].push(modelName)
                        }
                        
                    }
                }
            })

            let isUpdateMethod = argv.method === 'update'
            let promises = _.map(modelsByDS, function (modelNames, dsLowerName) {
                let ds = datasources[dsLowerName]
                let migrateMethod = isUpdateMethod ? ds.autoupdate : ds.automigrate
                if (!migrateMethod) return Promise.resolve()

                dh.debug.info(`Starting ${ds.settings.name} datasource's migration with ${argv.method} method`)
                dh.debug.info(`Models to migrate ${JSON.stringify(modelNames)}`)
                migrateMethod = Promise.promisify(migrateMethod, {context: ds})
                return migrateMethod(modelNames)
                    .then(function () {
                        dh.debug.info(`${ds.settings.name} datasource migration have finished.`)
                    })
            })


            return Promise.all(promises)
                .then(resolve)
                .catch(reject)
        })
    })
}
