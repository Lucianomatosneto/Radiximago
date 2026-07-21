{
    routerBasename: '/',
    showStudyList: true,
    dataSources: [
    {
    namespace: '@ohif/extensiondefault.dataSourcesModule.dicomweb',
    sourceName: 'dicomweb',
    configuration: {
    friendlyName: 'Radix Imago - Orthanc',
    name: 'orthanc',
    wadoUriRoot: 'http://localhost:8042/wado',
    qidoRoot: 'http://localhost:8042/dicom-web',
    wadoRoot: 'http://localhost:8042/dicom-web',
    qidoSupportsIncludeField: false,
    supportsReject: false,
    imageRendering: 'wadors',
    thumbnailRendering: 'wadors',
    enableStudyLazyLoad: true,
    supportsFuzzyMatching: false,
    supportsWildcard: true,
    staticWado: false,
    singlepart: 'bulkdata,video',
    requestOptions: {
    auth: 'admin:__ORTHANC_PASSWORD__'
    }
    }
    }
    ],
    defaultDataSourceName: 'dicomweb'
   }