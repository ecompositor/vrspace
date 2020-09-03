export class VRSpaceUI {
  constructor( ) {
    this.scene = null;
    this.logo = null;
    this.initialized = false;
    this.debug = false;
  }

  async init(scene) {
    if ( ! this.initialized ) {
      this.scene = scene;
      // TODO figure out location of script
      var container = await BABYLON.SceneLoader.LoadAssetContainerAsync("/babylon/","logo.glb",this.scene);
      this.logo = container.meshes[0];
      for ( var i = 0; i < container.meshes; i++ ) {
        container.meshes[i].checkCollisions = false;
      }
      this.logo.name = "VRSpace.org Logo";
      this.initialized = true;
    }
    return this;
  }

  log( something ) {
    if ( this.debug ) {
      console.log( something );
    }
  }

  listFiles(theUrl, callback){
    this.log("Fetching "+theUrl);
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.responseType = "document";
    xmlHttp.onreadystatechange = function() {
      if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
        callback(xmlHttp);
      }
    }
    xmlHttp.open("GET", theUrl, true); // true for asynchronous
    xmlHttp.send(null);
    return xmlHttp;
  }

  listCharacters(dir, callback) {
    var ui = this;
    return this.listFiles(dir, function(xmlHttp) {
      var links = xmlHttp.responseXML.links;
      var files = [];
      var fixes = [];
      
      // first pass:
      // iterate all links, collect avatar directories and fixes
      for ( var i = 0; i < links.length; i++ ) {
        var link = links[i];
        var href = link.href;
        if ( href.indexOf('?') > 0 ) {
          continue;
        }
        if ( link.baseURI.length > link.href.length ) {
          continue;
        }
        if ( link.href.endsWith('-fixes.json') ) {
          fixes.push(href.substring(link.baseURI.length));
          continue;
        }
        if ( ! link.href.endsWith('/') ) {
          continue;
        }
        href = href.substring(link.baseURI.length);
        href = href.substring(0,href.indexOf('/'));
        ui.log(link.baseURI+' '+href);
        files.push(href);
      }

      // second pass: match avatars with fixes
      var avatars = [];
      for ( var i = 0; i < files.length; i++ ) {
        var fix = null;
        var fixName = files[i]+"-fixes.json";
        var index = fixes.indexOf(fixName);
        if ( index >= 0) {
          fix = fixes[index];
        }
        avatars.push(new CharacterFolder( dir, files[i], fix ));
      }
      
      ui.log(avatars);
      callback(avatars);
    });
  }
  
  // utility methods to manipulate meshes
  receiveShadows( node, shadows ) {
    node.receiveShadows = shadows;
    if ( node.material ) {
      if ( node.material.getClassName() == "PBRMaterial" ) {
        // something to do with inverse square root of physical material
        node.material.usePhysicalLightFalloff = false;
      }
    }
    var children = node.getChildMeshes();
    for ( var i = 0; i < children.length; i++ ) {
      // Instances should only be created for meshes with geometry.
      this.receiveShadows(children[i], shadows);
    }
  }

  copyMesh(mesh, parent) {
    if ( mesh.geometry ) {
      var copy = mesh.createInstance(mesh.name+"-copy");
      copy.parent = parent;
    } else if (parent) {
      copy = parent;
    } else {
      var copy = mesh.clone( mesh.name+"-copy", parent, true, false );
      copy.parent = parent;
    }
    var children = mesh.getChildMeshes();
    for ( var i = 0; i < children.length; i++ ) {
      // Instances should only be created for meshes with geometry.
      if ( children[i].geometry ) {
        this.copyMesh(children[i], copy);
      }
    }
    return copy;
  }
  
}

export const VRSPACEUI = new VRSpaceUI();

class CharacterFolder {
  constructor( baseUrl, name, fixFile ) {
    this.baseUrl = baseUrl;
    this.name = name;
    this.fixFile = fixFile;
  }
}

export class LoadProgressIndicator {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.mesh = null;
    this.totalItems = 0;
    this.currentItem = 0;
    this.zeroRotation = null;
    this.debug = false;
    this.angle = 0;
    this.trackItems = true;
    var indicator = this;
    VRSPACEUI.init(scene).then( (ui) => {
        indicator.mesh = ui.logo.clone("LoadingProgressIndicator");
        indicator.mesh.scaling.scaleInPlace(0.05);
        indicator.attachTo( indicator.camera );
        indicator.zeroRotation = new BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X,Math.PI/2);
        indicator.mesh.rotationQuaternion = indicator.zeroRotation;
        indicator.mesh.setEnabled(indicator.totalItems > indicator.currentItem);
        indicator.log("Loaded logo, current progress "+indicator.currentItem+"/"+indicator.totalItems);
    });
    scene.onActiveCameraChanged.add( () => {
      console.log("Camera changed: "+scene.activeCamera.getClassName());
      this.attachTo(camera); // FIXME undefined
    });
  }
  _init() {
    this.totalItems = 0;
    this.currentItem = 0;
    this.angle = 0;
  }
  attachTo(camera) { // FIXME not used
    this.camera = this.scene.activeCamera;
    if ( this.mesh ) {
      this.mesh.parent = this.scene.activeCamera;
      // VRDeviceOrientationFreeCamera
      // WebXRCamera
      if ( this.scene.activeCamera.getClassName() == 'WebXRCamera' ) {
        this.mesh.position = new BABYLON.Vector3(0,-0.2,0.5);
      } else {
        this.mesh.position = new BABYLON.Vector3(0,-0.1,0.5);
      }
    }
  }
  add(item) {
    if ( this.mesh && ! this.mesh.isEnabled() ) {
      this.mesh.setEnabled(true);
    }
    this.totalItems++;
    this.log("Added "+this.currentItem+"/"+this.totalItems);
    this._update();
  }
  remove(item) {
    this.currentItem++;
    this._update();
    this.log("Finished "+this.currentItem+"/"+this.totalItems);
    if ( this.totalItems <= this.currentItem && this.mesh ) {
      this.mesh.setEnabled(false);
      this._init();
    }
  }
  progress(evt, item) {
    this.trackItems = false;
    if (evt.lengthComputable) {
      var loaded = evt.loaded / evt.total;
      this.log("Loaded "+(loaded*100)+"%");
      if ( this.mesh && this.zeroRotation ) {
        this.angle -= 0.01;
        this.mesh.rotationQuaternion = this.zeroRotation.multiply( new BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y,this.angle) );
      }
    } else {
      var dlCount = evt.loaded / (1024 * 1024);
      this.log("Loaded "+dlCount+" MB" );
    }
  }
  _update() {
    if ( this.mesh && this.zeroRotation ) {
      if ( this.trackItems ) {
        this.angle = 2*Math.PI*(1-this.currentItem/this.totalItems);
      } else {
        this.angle -= 0.01;
      }
      this.mesh.rotationQuaternion = this.zeroRotation.multiply( new BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y,this.angle) );
    }
  }
  log(something) {
    if ( this.debug ) {
      console.log(something);
    }
  }
}

export class FloorRibbon {
  constructor( scene, size ) {
    // parameters
    this.scene = scene;
    if ( size ) {
      this.size = size;
    } else {
      this.size = 1;
    }
    this.decimals = 2;
    this.floorMaterial = new BABYLON.StandardMaterial("floorMaterial", this.scene);
    this.floorMaterial.diffuseColor = new BABYLON.Color3(.5, 1, .5);
    this.floorMaterial.backFaceCulling = false;
    this.floorMaterial.alpha = 0.5;
    // state variables
    this.leftPath = [];
    this.rightPath = [];
    this.pathArray = [this.leftPath, this.rightPath];
    this.left = BABYLON.MeshBuilder.CreateSphere("leftSphere", {diameter: 1}, scene);
    this.right = BABYLON.MeshBuilder.CreateSphere("rightSphere", {diameter: 1}, scene);
    this.left.isVisible = false;
    this.right.isVisible = false;
    scene.onActiveCameraChanged.add( (s) => this.cameraChanged() );
    this.recording = false;
    this.editing = false;
    this.resizing = false;
    this.floorCount = 0;
  }
  cameraChanged() {
    console.log("Camera changed: "+this.scene.activeCamera.getClassName()+" new position "+this.scene.activeCamera.position);
    this.camera = this.scene.activeCamera;
    this.left.parent = this.camera;
    this.right.parent = this.camera;
    this.recordButton.mesh.parent = this.camera;
    this.editButton.mesh.parent = this.camera;
    this.jsonButton.mesh.parent = this.camera;
    this.jsButton.mesh.parent = this.camera;
  }
  showUI() {
    this.camera = this.scene.activeCamera;

    var manager = new BABYLON.GUI.GUI3DManager(scene);

    this.recordButton = new BABYLON.GUI.HolographicButton("RecordPath");
    manager.addControl(this.recordButton);
    this.recordButton.imageUrl = "//www.babylonjs-playground.com/textures/icons/Play.png"; // FIXME: cdn
    this.recordButton.position = new BABYLON.Vector3(-0.1,-0.1,.5);
    this.recordButton.scaling = new BABYLON.Vector3( .05, .05, .05 );
    this.recordButton.onPointerDownObservable.add( () => this.startStopCancel());

    this.editButton = new BABYLON.GUI.HolographicButton("EditPath");
    this.editButton.imageUrl = "//www.babylonjs-playground.com/textures/icons/Edit.png"; // FIXME: cdn
    manager.addControl(this.editButton);
    this.editButton.position = new BABYLON.Vector3(0,-0.1,.5);
    this.editButton.scaling = new BABYLON.Vector3( .05, .05, .05 );
    this.editButton.onPointerDownObservable.add( () => this.edit());

    this.jsonButton = new BABYLON.GUI.HolographicButton("SavePathJson");
    this.jsonButton.imageUrl = "//www.babylonjs-playground.com/textures/icons/Download.png"; // FIXME: cdn
    manager.addControl(this.jsonButton);
    this.jsonButton.text="JSON";
    this.jsonButton.position = new BABYLON.Vector3(0.1,-0.1,.5);
    this.jsonButton.scaling = new BABYLON.Vector3( .05, .05, .05 );
    this.jsonButton.onPointerDownObservable.add( () => this.saveJson());

    this.jsButton = new BABYLON.GUI.HolographicButton("SavePathJs");
    this.jsButton.imageUrl = "//www.babylonjs-playground.com/textures/icons/Download.png"; // FIXME: cdn
    manager.addControl(this.jsButton);
    this.jsButton.text="JS";
    this.jsButton.position = new BABYLON.Vector3(0.2,-0.1,.5);
    this.jsButton.scaling = new BABYLON.Vector3( .05, .05, .05 );
    this.jsButton.onPointerDownObservable.add( () => this.saveJs());

    this.editButton.isVisible = false;
    this.jsonButton.isVisible = false;
    this.jsButton.isVisible = false;

    this.recordButton.mesh.parent = this.camera;
    this.editButton.mesh.parent = this.camera;
    this.jsonButton.mesh.parent = this.camera;
    this.jsButton.mesh.parent = this.camera;
  }
  startStopCancel() {
    if ( this.floorMesh ) {
      // cancel
      this.floorMesh.dispose();
      delete this.floorMesh;
      this.leftPath = [];
      this.rightPath = [];
      this.pathArray = [ this.leftPath, this.rightPath ];
    } else {
      this.recording = !this.recording;
      if ( this.recording ) {
        // start
        this.startRecording();
      } else {
        // stop
        this.createPath();
      }
    }
    this.updateUI();
  }
  updateUI() {
    if ( this.recording ) {
      this.recordButton.imageUrl = "//www.babylonjs-playground.com/textures/icons/Pause.png"; // FIXME: cdn
    } else if ( this.floorMesh) {
      this.recordButton.imageUrl = "//www.babylonjs-playground.com/textures/icons/Undo.png"; // FIXME: cdn
    } else {
      this.recordButton.imageUrl = "//www.babylonjs-playground.com/textures/icons/Play.png"; // FIXME: cdn
    }
    this.editButton.isVisible = !this.recording && this.floorMesh;
    this.jsonButton.isVisible = !this.recording && this.floorMesh;
    this.jsButton.isVisible = !this.recording && this.floorMesh;
  }
  trackActiveCamera() {
    var camera = this.scene.activeCamera;
    if ( camera ) {
      this.trackCamera(camera);
    }
  }
  startRecording() {
    this.leftPath = [];
    this.rightPath = [];
    this.pathArray = [ this.leftPath, this.rightPath ];
    this.trackActiveCamera();
  }
  trackCamera(camera) {
    console.log("Tracking camera");
    if ( camera ) {
      this.camera = camera;
    }
    this.lastX = this.camera.position.x;
    this.lastZ = this.camera.position.z;
    this.observer = this.camera.onViewMatrixChangedObservable.add((c) => this.viewChanged(c));

    this.left.parent = camera;
    this.right.parent = camera;
    var height = camera.ellipsoid.y*2;
    if ( this.camera.getClassName() == 'WebXRCamera' ) {
      var height = this.camera.realWorldHeight;
    }
    this.left.position = new BABYLON.Vector3(-1, -height, 0);
    this.right.position = new BABYLON.Vector3(1, -height, 0);
  }
  viewChanged(camera) {
    if (
      camera.position.x > this.lastX + this.size ||
      camera.position.x < this.lastX - this.size ||
      camera.position.z > this.lastZ + this.size ||
      camera.position.z < this.lastZ - this.size
    ) {
      //console.log("Pos: "+camera.position);
      //console.log("Pos left: "+this.left.absolutePosition+" right: "+this.right.absolutePosition);
      this.lastX = camera.position.x;
      this.lastZ = camera.position.z;
      if ( this.recording ) {
        this.leftPath.push( this.left.absolutePosition.clone() );
        this.rightPath.push( this.right.absolutePosition.clone() );
      }
    }
  }
  createPath() {
    if ( this.leftPath.length > 1 ) {
      this.addToScene();
    }
    this.camera.onViewMatrixChangedObservable.remove(this.observer);
    delete this.observer;
  }
  addToScene() {
    //var floorGroup = new BABYLON.TransformNode("floorGroup");
    //this.scene.addTransformNode( floorGroup );

    this.floorCount++;
    var floorMesh = BABYLON.MeshBuilder.CreateRibbon( "FloorRibbon"+this.floorCount, {pathArray: this.pathArray, updatable: true}, this.scene );
    floorMesh.material = this.floorMaterial;
    floorMesh.checkCollisions = false;
    this.floorMesh = floorMesh;
  }
  clear(){
    delete this.floorMesh;
    this.leftPath = [];
    this.rightPath = [];
    this.pathArray = [ this.leftPath, this.rightPath ];
    this.updateUI();
  }
  edit() {
    if ( ! this.floorMesh ) {
      return;
    }
    this.recordButton.isVisible = this.editing;
    this.jsonButton.isVisible = this.editing;
    this.jsButton.isVisible = this.editing;
    this.editing = !this.editing;
    if ( this.resizing ) {
      scene.onPointerObservable.remove( this.observer );
      this.resizing = false;
      delete this.observer;
      delete this.pathPoints;
      delete this.point1;
      delete this.point2;
      this.editButton.imageUrl = "//www.babylonjs-playground.com/textures/icons/Edit.png"; // FIXME: cdn
      if ( this.edgeMesh ) {
        this.edgeMesh.dispose();
        delete this.edgeMesh;
      }
    } else if ( this.editing ) {
      this.editButton.imageUrl = "//www.babylonjs-playground.com/textures/icons/Back.png"; // FIXME: cdn
      this.editButton.text = "Pick 1";
      this.resizing = true;
      this.observer = scene.onPointerObservable.add((pointerInfo) => {
        switch (pointerInfo.type) {
          case BABYLON.PointerEventTypes.POINTERDOWN:
            if(pointerInfo.pickInfo.hit && pointerInfo.pickInfo.pickedMesh == this.floorMesh) {
              if ( ! this.point1 ) {
                this.point1 = this.pickClosest(pointerInfo.pickInfo);
                this.editButton.text = "Pick 2";
              } else if ( ! this.point2 ) {
                this.point2 = this.pickClosest(pointerInfo.pickInfo);
                this.selectEdge();
                this.editButton.text = "Drag";
              } else {
                this.pickedPoint = this.pickClosest(pointerInfo.pickInfo);
                this.editButton.imageUrl = "/content/icons/tick.png";
                this.editButton.text = null;
              }
            }
            break;
          case BABYLON.PointerEventTypes.POINTERUP:
            delete this.pickedPoint;
            break;
          case BABYLON.PointerEventTypes.POINTERMOVE:
            if ( this.pickedPoint && pointerInfo.pickInfo.pickedMesh == this.floorMesh ) {
              this.resizeRibbon( pointerInfo.pickInfo.pickedPoint );
            }
            break;
          }
      });
    } else if ( this.observer ) {
      this.editButton.text = null;
      scene.onPointerObservable.remove( this.observer );
    }
  }
  pickClosest( pickInfo ) {
    var pickedIndex = 0;
    var pickedLeft = false;
    var path;
    var pathPoint;
    var min = 100000;
    for ( var i = 0; i < this.leftPath.length; i++ ) {
      var leftDistance = pickInfo.pickedPoint.subtract( this.leftPath[i] ).length();
      var rightDistance = pickInfo.pickedPoint.subtract( this.rightPath[i] ).length();
      if ( leftDistance < min ) {
        min = leftDistance;
        pickedLeft = true;
        pickedIndex = i;
        path = this.leftPath;
        pathPoint = this.leftPath[i];
      }
      if ( rightDistance < min ) {
        min = rightDistance;
        pickedLeft = false;
        pickedIndex = i;
        path = this.rightPath;
        pathPoint = this.rightPath[i];
      }
    }
    var ret = {
      index: pickedIndex,
      path: path,
      left: pickedLeft,
      pathPoint: pathPoint,
      point: pickInfo.pickedPoint.clone()
    };
    console.log("Picked left: "+pickedLeft+" index: "+pickedIndex+"/"+path.length+" distance: "+min);
    return ret;
  }
  selectEdge() {
    if ( this.point1.index > this.point2.index ) {
      var tmp = this.point2;
      this.point2 = this.point1;
      this.point1 = tmp;
    }
    var points = []
    for ( var i = this.point1.index; i <= this.point2.index; i++ ) {
      if ( this.point1.left ) {
        points.push( this.leftPath[i] );
      } else {
        points.push( this.rightPath[i] );
      }
    }
    this.pathPoints = points;
    if ( this.pathPoints.length > 1 ) {
      this.edgeMesh = BABYLON.MeshBuilder.CreateLines("FloorEdge", {points: points, updatable: true}, this.scene );
    } else {
      this.edgeMesh = BABYLON.MeshBuilder.CreateSphere("FloorEdge", {diameter:0.1}, this.scene);
      this.edgeMesh.position = this.pathPoints[0];
    }
  }
  resizeRibbon(point) {
    var diff = point.subtract(this.pickedPoint.point);
    for (var i = 0; i < this.pathPoints.length; i++ ) {
      this.pathPoints[i].addInPlace(diff);
    }
    this.pickedPoint.point = point.clone();
    // update the ribbon
    // seems buggy:
    //BABYLON.MeshBuilder.CreateRibbon( "FloorRibbon"+this.floorCount, {pathArray: this.pathArray, instance: this.floorMesh});
    var floorMesh = BABYLON.MeshBuilder.CreateRibbon( "FloorRibbon"+this.floorCount, {pathArray: this.pathArray, updatable: true}, this.scene );
    floorMesh.material = this.floorMaterial;
    floorMesh.checkCollisions = false;
    this.floorMesh.dispose();
    this.floorMesh = floorMesh;
    // update the edge
    if ( this.pathPoints.length > 1 ) {
      BABYLON.MeshBuilder.CreateLines("FloorEdge", {points: this.pathPoints, instance: this.edgeMesh} );
    }
  }
  saveJson() {
    var json = this.printJson();
    this.saveFile('FloorRibbon'+this.floorCount+'.json', json);
    this.clear();
  }
  saveJs() {
    var js = this.printJs();
    this.saveFile('FloorRibbon'+this.floorCount+'.js', js);
    this.clear();
  }
  printJson() {
    var ret = '{"pathArray":\n';
    ret += "[\n";
    ret += this.printPathJson(this.leftPath);
    ret += "\n],[\n";
    ret += this.printPathJson(this.rightPath);
    ret += "\n]}";
    console.log(ret);
    return ret;
  }
  printJs() {
    var ret = "BABYLON.MeshBuilder.CreateRibbon( 'FloorRibbon"+this.floorCount+"', {pathArray: \n";
    ret += "[[\n";
    ret += this.printPathJs(this.leftPath);
    ret += "\n],[\n";
    ret += this.printPathJs(this.rightPath);
    ret += "\n]]}, scene );";
    console.log(ret);
    return ret;
  }
  printPathJs(path) {
    var ret = "";
    for ( var i = 0; i < path.length-1; i++ ) {
      ret += "new BABYLON.Vector3("+path[i].x.toFixed(this.decimals)+","+path[i].y.toFixed(this.decimals)+","+path[i].z.toFixed(this.decimals)+"),";
    }
    ret += "new BABYLON.Vector3("+path[path.length-1].x.toFixed(this.decimals)+","+path[path.length-1].y.toFixed(this.decimals)+","+path[path.length-1].z.toFixed(this.decimals)+")";
    return ret;
  }
  printPathJson(path) {
    var ret = "";
    for ( var i = 0; i < path.length-1; i++ ) {
      ret += "["+path[i].x.toFixed(this.decimals)+","+path[i].y.toFixed(this.decimals)+","+path[i].z.toFixed(this.decimals)+"],";
    }
    ret += "["+path[path.length-1].x.toFixed(this.decimals)+","+path[path.length-1].y.toFixed(this.decimals)+","+path[path.length-1].z.toFixed(this.decimals)+"]";
    return ret;
  }
  saveFile(filename, content) {
    var a = document.createElement('a');
    var blob = new Blob([content], {'type':'application/octet-stream'});
    a.href = window.URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }
}

export class Buttons {
  constructor(scene,title,options,callback,property) {
    this.scene = scene;
    this.title = title;
    this.options = options;
    this.callback = callback;
    this.property = property;
    this.buttonHeight = 1;
    this.group = new BABYLON.TransformNode(this.title, scene);
    this.groupWidth = 0;
    this.buttons = [];
    this.selectedOption = -1;
    this.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.turOff = false;
    this.display();
  }

  setHeight(height) {
    var scale = height/this.options.length;
    this.group.scaling = new BABYLON.Vector3(scale, scale, scale);
  }

  display() {
    var buttonHeight = 1;
    var spacing = 1.1;

    var selectedMaterial = new BABYLON.StandardMaterial("selectedButtonMaterial", scene);
    selectedMaterial.diffuseColor = new BABYLON.Color3(.2,.5,.2);
    var unselectedMaterial = new BABYLON.StandardMaterial("unselectedButtonMaterial", scene);
    unselectedMaterial.diffuseColor = new BABYLON.Color3(.2,.2,.2);

    if ( this.title && this.title.length > 0 ) {
      var titleText = new BABYLON.GUI.TextBlock();
      titleText.text = this.title;
      titleText.textHorizontalAlignment = this.horizontalAlignment;
      titleText.textVerticalAlignment = this.verticalAlignment;
      titleText.color = "white";

      var titlePlane = BABYLON.MeshBuilder.CreatePlane("Text"+this.title, {height:2,width:this.title.length*2}, scene);
      titlePlane.parent = this.group;
      titlePlane.position = new BABYLON.Vector3(this.title.length,spacing*2,0);

      var titleTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(
        titlePlane,
        titleText.fontSizeInPixels * titleText.text.length,
        titleText.fontSizeInPixels,
        false // mouse events disabled
      );
      titleTexture.addControl(titleText);
    }

    for ( var i = 0; i < this.options.length; i ++ ) {
      if ( this.property ) {
        var option = this.options[i][this.property];
      } else {
        var option = this.options[i];
      }
      this.groupWidth = Math.max( this.groupWidth, option.length);
      var buttonText = new BABYLON.GUI.TextBlock();
      buttonText.text = option;
      buttonText.textHorizontalAlignment = this.horizontalAlignment;
      buttonText.textVerticalAlignment = this.verticalAlignment;

      var buttonWidth = buttonText.text.length;
      var buttonPlane = BABYLON.MeshBuilder.CreatePlane("Text"+option, {height:1,width:buttonWidth}, scene);
      buttonPlane.position = new BABYLON.Vector3(buttonWidth/2+buttonHeight,-i*spacing,0);
      buttonText.color="white";
      buttonPlane.parent = this.group;

      var aTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(
        buttonPlane,
        buttonText.fontSizeInPixels*buttonText.text.length,
        buttonText.fontSizeInPixels+2, // CHECKME: padding or something?
        false // mouse events disabled
      );
      aTexture.addControl(buttonText);

      var button = BABYLON.MeshBuilder.CreateCylinder("Button"+option, {height:.1, diameter:buttonHeight*.8}, scene);
      button.material = unselectedMaterial;
      button.rotation = new BABYLON.Vector3(Math.PI/2, 0, 0);
      button.position = new BABYLON.Vector3(buttonHeight/2, -i*spacing, 0);
      button.parent = this.group;
      this.buttons.push(button);
    }

    scene.onPointerObservable.add( (e) => {
      if(e.type == BABYLON.PointerEventTypes.POINTERDOWN){
        var p = e.pickInfo;
        for ( var i = 0; i < this.options.length; i++ ) {
          if ( p.pickedMesh == this.buttons[i] ) {
            // we may want to handle double click somehow
            if ( i != this.selectedOption || this.turnOff) {
              console.log("Selected: "+this.options[i].name);
              if ( this.callback ) {
                this.callback(this.options[i]);
              }
              this.buttons[i].material = selectedMaterial;
              if ( this.selectedOption > -1 ) {
                this.buttons[this.selectedOption].material = unselectedMaterial;
              }
              if ( i != this.selectedOption ) {
                this.selectedOption = i;
              } else {
                this.selectedOption = -1;
              }
            }
            break;
          }
        }
      }
    });

    //this.group.position = new BABYLON.Vector3(0,this.options.length,0);
    console.log("Group width: "+this.groupWidth);
  }

  dispose() {
    this.group.dispose();
  }

}

// this is intended to be overridden
export class World {
  async init(engine, name) {
    this.engine = engine;
    this.scene = await this.createScene(engine);
    this.indicator = new LoadProgressIndicator(this.scene, this.camera);
    this.registerRenderLoop();
    this.createTerrain();
    this.load(name);
    return this.scene;
  }
  async createScene(engine) {
    alert('Please override createScene(engine) method');
  }
  
  async initXR() {
    const xrHelper = await this.scene.createDefaultXRExperienceAsync({floorMeshes: this.getFloorMeshes()});

    this.vrHelper = xrHelper;

    if (xrHelper.baseExperience) {
      console.log("Using XR helper");

      xrHelper.baseExperience.onInitialXRPoseSetObservable.add( (xrCamera) => {
          xrCamera.position.y = this.camera.position.y - this.camera.ellipsoid.y*2;
      });

      var tracker = () => this.trackXrDevices();
      xrHelper.baseExperience.onStateChangedObservable.add((state) => {
        console.log( "State: "+state );
        switch (state) {
          case BABYLON.WebXRState.IN_XR:
            // XR is initialized and already submitted one frame
            console.log( "Entered VR" );
            scene.registerBeforeRender(tracker);
            // Workaround for teleporation/selection bug
            xrHelper.teleportation.setSelectionFeature(null);
            this.inXR = true;
            break;
          case BABYLON.WebXRState.ENTERING_XR:
            // xr is being initialized, enter XR request was made
            console.log( "Entering VR" );
            this.collisions(false);
            break;
          case BABYLON.WebXRState.EXITING_XR:
            console.log( "Exiting VR" );
            scene.unregisterBeforeRender(tracker);
            // doesn't do anything
            //camera.position.y = xrHelper.baseExperience.camera.position.y + 3; //camera.ellipsoid.y*2;
            this.collisions(true);
            this.inXR = false;
            break;
          case BABYLON.WebXRState_NOT_IN_XR:
            console.log( "Not in VR" );
            // self explanatory - either out or not yet in XR
            break;
        }
      });

      // CHECKME: really ugly way to make it work
      this.scene.pointerMovePredicate = (mesh) => {
        return this.isSelectableMesh(mesh);
      };
      xrHelper.pointerSelection.raySelectionPredicate = (mesh) => {
        return this.isSelectableMesh(mesh);
      };

      xrHelper.teleportation.rotationEnabled = false; // CHECKME
      //xrHelper.teleportation.parabolicRayEnabled = false; // CHECKME

      // TODO: trying to update terrain after teleport
      xrHelper.baseExperience.sessionManager.onXRReferenceSpaceChanged.add( (xrReferenceSpace) => {
        var targetPosition = xrHelper.baseExperience.camera.position;
        this.camera.globalPosition.x = targetPosition.x;
        this.camera.globalPosition.y = targetPosition.y;
        this.camera.globalPosition.z = targetPosition.z;
        if ( this.terrain ) {
          terrain.update(false);
        }
        // TODO we can modify camera y here, adding terrain height on top of ground height
      });
      
      xrHelper.input.onControllerAddedObservable.add((xrController /* WebXRController instance */ ) => {
        console.log("Controller added: "+xrController.grip.name+" "+xrController.grip.name);
        console.log(xrController);
        if ( xrController.grip.id.toLowerCase().indexOf("left") >= 0 || xrController.grip.name.toLowerCase().indexOf("left") >=0 ) {
          this.leftController = xrController;
        } else if (xrController.grip.id.toLowerCase().indexOf("right") >= 0 || xrController.grip.name.toLowerCase().indexOf("right") >= 0) {
          this.rightController = xrController;
        } else {
          log("ERROR: don't know how to handle controller");
        }
      });
      
      
    } else {
      // obsolete and unsupported TODO REMOVEME
      this.vrHelper = this.scene.createDefaultVRExperience({createDeviceOrientationCamera: false });
      //vrHelper.enableInteractions();
      this.vrHelper.webVRCamera.ellipsoid = new BABYLON.Vector3(.5, 1.8, .5);
      this.vrHelper.onEnteringVRObservable.add(()=>{this.collisions(false)});
      this.vrHelper.onExitingVRObservable.add(()=>{this.collisions(true);});

      this.vrHelper.enableTeleportation({floorMeshes: this.getFloorMeshes(this.scene)});
      this.vrHelper.raySelectionPredicate = (mesh) => {
        return this.isSelectableMesh(mesh);
      };
      
      this.vrHelper.onBeforeCameraTeleport.add((targetPosition) => {
        this.camera.globalPosition.x = targetPosition.x;
        this.camera.globalPosition.y = targetPosition.y;
        this.camera.globalPosition.z = targetPosition.z;
        if ( this.terrain ) {
          terrain.update(true);
        }
      });
      
    }
  }

  trackXrDevices() {
  }
  
  isSelectableMesh(mesh) {
    return this.floorMeshes && this.floorMeshes.includes(mesh);
  }

  getFloorMeshes() {
    return this.floorMeshes;
  }
  
  collisions(state) {
    this._collisions( this.floorMeshes, state );
    this._collisions( this.sceneMeshes, state );
    this.camera.applyGravity = state;
    this.camera._needMoveForGravity = state;
  }
  
  _collisions( meshes, state ) {
    if ( meshes ) {
      for ( var i=0; i<meshes.length; i++ ) {
        meshes[i].checkCollisions = state;
      }
    }
  }
  
  load( name, file ) {
    if ( ! file ) {
      file = "scene.gltf";
    }
    var indicator = this.indicator;
    indicator.add(name);

    BABYLON.SceneLoader.LoadAssetContainer("",
      file,
      this.scene,
      // onSuccess:
      (container) => {
        this.sceneMeshes = container.meshes;
        this.container = container;

        // Adds all elements to the scene
        var mesh = container.createRootMesh();
        mesh.name = name;
        container.addAllToScene();
      
        this.loaded( file, mesh );

        // do something with the scene
        VRSPACEUI.log("World loaded");
        this.indicator.remove(name);
        //floor = new FloorRibbon(scene);
        //floor.showUI();
        this.collisions(true);
    },
    // onProgress:
    (evt) => { indicator.progress( evt, name ) }
    );
    
    return this;
  }
  
  loaded( file, mesh ) {
    this.initXR();
  }
  
  registerRenderLoop() {
    var scene = this.scene;
    // Register a render loop to repeatedly render the scene
    engine.runRenderLoop(function () {
        scene.render();
    });
  }

  createTerrain() {
  }
}
