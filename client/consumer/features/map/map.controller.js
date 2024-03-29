(function (){
    angular.module('map')
        .controller('MapController', MapController);

    function MapController($scope, $rootScope, leafletData, MapService, PoiService) {
        const map = leafletData.getMap('map');

        const vehicle = {
            WALKING: 0,
            DRIVING: 1,
            CYCLING: 2,
            properties: {
                0: {name: "walking", value: 0, code: "mapbox/walking"},
                1: {name: "driving", value: 1, code: "mapbox/driving"},
                2: {name: "cycling", value: 2, code: "mapbox/cycling"}
            }
        };

        let userMarker;
        let myRoute;
        let poiMarkers = [];
        let isWatching = false;

        this.center = {};
        this.defaults = {
            maxZoom: 18,
            minZoom: 2,
            scrollWheelZoom: true,
            doubleClickZoom: false,
            zoomControlPosition: 'bottomright'
        };
        this.events = {
            map: {
                enable: ['zoomstart', 'drag', 'dblclick', 'mousemove'],
                logic: 'emit'
            }
        };

        /*
                       North (+90)
                           |
            (-180) West ———+——— East (+180)
                           |
                         South (-90)
        * */
        this.mybounds = {'northEast': {'lat': 90, 'lng': 180},'southWest': {'lat': -90, 'lng': -180}};

        $scope.$on('wai.map.autocomplete.selected', (event, item) => {
            let userPosition = new L.LatLng(parseFloat(item.lat), parseFloat(item.lon));
            updateUserPosition(userPosition.lat, userPosition.lng);
        });

        $scope.$on('wai.poiservice.showpoi', (event) => {
            let listPoi = PoiService.getAllPoi();
            showPOI(listPoi);
        });

        $scope.$on('wai.map.direction', (event, idPoi, mode) => {
            let destination = PoiService.getPoi(idPoi);
            let coord = destination.location;
            updateRoute(userMarker.getLatLng(), coord, mode);

            if(!isWatching){
                isWatching = true;
                getLocation(true);
            }
        });

        $scope.$on('wai.map.stopdirection', (event) => {
           clearRoute();
        });

        const getLocation = (watch) => {
            map.then((map) => {
                map
                    .locate({setView: true, enableHighAccuracy: true, watch: watch, maximumAge: 15000})
                    .on('locationfound', (e) => {
                        updateUserPosition(e.latlng.lat, e.latlng.lng);
                        map.invalidateSize();

                        if(myRoute) {
                            let newCoord = new L.LatLng(e.latlng.lat, e.latlng.lng);
                            let myWaypoints = myRoute.getWaypoints();
                            if(myWaypoints[1].latLng){
                                updateRoute(newCoord, null, null);
                            }
                        }
                    })
                    .on('locationerror', (e) => {
                        console.log(e);
                    });
            });
        };

        const updateUserPosition = (lat, lng) => {
            centerView(lat, lng);
            updateMarker(lat, lng);
        };

        const centerView = (lat, lng) => {
            this.center.lat = lat;
            this.center.lng = lng;
            this.center.zoom = 16;
        };

        const updateMarker = (lat, lng) => {
            map.then((map) => {
                if (userMarker) {
                    map.removeLayer(userMarker);
                }

                let redIcon = new L.Icon({
                    iconUrl: 'common/assets/png/marker-icon-red.png',
                    shadowUrl: 'common/assets/png/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });


                // Marker
                const markerLocation = new L.LatLng(lat, lng);
                const markerOptions = {
                    icon: redIcon,
                    draggable: 'true'
                };
                userMarker = L.marker(markerLocation, markerOptions);

                if(myRoute) {
                    let myWaypoints = myRoute.getWaypoints();
                    let destCoord = myWaypoints[1].latLng;
                    if(destCoord && markerLocation.equals(destCoord, 1.0E-3)){
                        clearRoute();
                        $rootScope.$broadcast('wai.poiservice.destinationreached');
                    }
                }

                userMarker.on('dragend', function (){
                    updateUserPosition(userMarker.getLatLng().lat, userMarker.getLatLng().lng);
                    let myWaypoints = myRoute.getWaypoints();
                    if(myWaypoints[1].latLng){
                        updateRoute(userMarker.getLatLng(), null, null);
                    }
                });

                map.addLayer(userMarker);
                if(PoiService.isEmpty()){
                    PoiService.update(lat, lng);
                }
            });
        };

        const getPageImages = function (pageTitle, imageSize) {
            return MapService.getPageImages(pageTitle, imageSize).then(function (data) {
                console.log(data);
                return data;
            }).catch(function (error) {
                console.log(error);
                return[];
            });
        };

        const initRoute = (mode) => {
            //let options = { profile: vehicle.properties[vehicle.WALKING].code };
            let userVehicle = (mode) ? vehicle.properties[mode].code : vehicle.properties[vehicle.WALKING].code;
            map.then( (map) => {
                myRoute = L.Routing.control({
                    router: L.Routing.mapbox('pk.eyJ1IjoidGVjYW5vZ2kiLCJhIjoiY2sybG5pZnl6MDV5bDNjbmxucTV2cDB2MCJ9.evfYalXeyuu-yEYoJ_4oEg', {
                            profile:userVehicle
                        }),
                    waypoints: [],
                    createMarker: function(index, waypoint, n) {
                        return null;
                    },
                    show: false
                }).addTo(map);
            });
        };

        const updateRoute = (from, to, mode) => {
            myRoute.show();

            if(mode || mode === 0){
                myRoute.getRouter().options.profile = vehicle.properties[mode].code;
            }

            if(from){
                myRoute.spliceWaypoints(0,1,from);
            }

            if(to){
                myRoute.spliceWaypoints(1,1,to);
            }

        };

        const removeRoute = () => {
            map.then((map) => {
                myRoute.hide();
                map.removeControl(myRoute);
                myRoute = null;
            });
        };

        const clearRoute = () => {
            myRoute.setWaypoints([]);
            myRoute.hide();

            map.then((map) => {
                map.stopLocate();
                isWatching = false;
            });
        };

        const createAwesomeIcon = (listCat) => {
            let item = listCat[0];
            return L.AwesomeMarkers.icon(item.icon)
        };

        const showPOI = (listPOI) => {
            map.then((map) => {
                for(let i = 0; i < poiMarkers.length; i++){
                    map.removeLayer(poiMarkers[i]);
                }
                poiMarkers = [];
                L.AwesomeMarkers.Icon.prototype.options.prefix = 'fa';
                for(let i = 0; i < listPOI.length; i++){
                    let item = listPOI[i];
                    let marker = L.marker([item.location.lat, item.location.lng], {icon: createAwesomeIcon(item['categories'])});

                    marker.idPoi = item.id;

                    getPageImages(item.name, 100).then(function (data){
                        angular.forEach(data['data']['query']['pages'], function (value, key){
                            let tmp = value['thumbnail'];
                            let myLink, width, height;
                            if(tmp){
                                myLink = tmp['source'];
                                width = tmp['width'];
                                height = tmp['height'];
                            } else {
                                myLink = "../common/assets/jpg/image-not-available.jpg";
                                width = 100;
                                height = 100;
                            }

                            let popupHTML = `
                                <div>
                                    <img src="${myLink}" width="${width}" height="${height}">
                                    <span>
                                        <strong>${item.name}</strong>
                                    </span>
                                </div>
                            `;
                            marker.bindPopup(popupHTML, {
                                maxWidth: 700,
                                closeButton: false,
                                className: 'popupStyle'
                            });
                        });
                    });

                    marker.on('mouseover', function (e){
                        this.openPopup();
                    });

                    marker.on('mouseout', function (e){
                        this.closePopup();
                    });

                    marker.on('click', function (e) {
                        $rootScope.$broadcast('wai.detail.toggle', this.idPoi);
                    });

                    map.addLayer(marker);
                    poiMarkers.push(marker);
                }
            });
        };

        map.then((map) => {
            setTimeout(() => {
                map.invalidateSize();
                initRoute();
            }, 0);
        });
        getLocation(false);
    }
})();
