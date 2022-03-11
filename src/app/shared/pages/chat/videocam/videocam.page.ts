import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { Platform, AlertController } from '@ionic/angular';
import { HttpClient, HttpHeaders } from '@angular/common/http';
//import { AndroidPermissions } from '@ionic-native/android-permissions/ngx';
//import { SplashScreen } from '@ionic-native/splash-screen/ngx';
//import { StatusBar } from '@ionic-native/status-bar/ngx';
import { AndroidPermissions } from '@awesome-cordova-plugins/android-permissions/ngx';

import { OpenVidu, Publisher, Session, StreamEvent, StreamManager, Subscriber } from 'openvidu-browser';
import { throwError as observableThrowError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { OpenViduService } from '../../../../core/services/open-vidu/open-vidu.service';

declare let cordova;


@Component({
  selector: 'app-videocam',
  templateUrl: './videocam.page.html',
  styleUrls: ['./videocam.page.scss'],
})

export class VideocamPage implements OnInit, OnDestroy {

  OPENVIDU_SERVER_URL = 'https://' + location.hostname + ':4443';
  OPENVIDU_SERVER_SECRET = 'MY_SECRET';

  // OPENVIDU_SERVER_URL = 'https://ec2-3-11-81-224.eu-west-2.compute.amazonaws.com';
  // OPENVIDU_SERVER_SECRET = 'eycir9UiULq8QLc';


  ANDROID_PERMISSIONS = [
    this.androidPermissions.PERMISSION.CAMERA,
    this.androidPermissions.PERMISSION.RECORD_AUDIO,
    this.androidPermissions.PERMISSION.MODIFY_AUDIO_SETTINGS
  ];

  // OpenVidu objects
  OV: OpenVidu;
  session: Session;
  publisher: StreamManager; // Local
  subscribers: StreamManager[] = []; // Remotes

  // Join form
  mySessionId: string;
  myUserName: string;

  constructor(
    private platform: Platform,
    private androidPermissions: AndroidPermissions,
    private httpClient: HttpClient,
    public alertController: AlertController,
    public openViduService: OpenViduService

  ) {
    this.initializeApp();
    this.generateParticipantInfo();
  }

  initializeApp() {
    this.platform.ready().then(() => {
      if (this.platform.is('ios') && this.platform.is('cordova')) {
        cordova.plugins.iosrtc.registerGlobals();
      }
    });
  }

  ngOnInit() {
  }


  ngOnDestroy() {
    // On component destroyed leave session
    this.leaveSession();
  }



  joinSession() {
    // --- 1) Get an OpenVidu object ---
    this.OV = new OpenVidu();

    // --- 2) Init a session ---
    this.session = this.OV.initSession();

    // --- 3) Specify the actions when events take place in the session ---
    // On every new Stream received...
    this.session.on('streamCreated', (event: StreamEvent) => {
      // Subscribe to the Stream to receive it. Second parameter is undefined
      // so OpenVidu doesn't create an HTML video on its own
      const subscriber: Subscriber = this.session.subscribe(event.stream, undefined);
      this.subscribers.push(subscriber);
    });

    // On every Stream destroyed...
    this.session.on('streamDestroyed', (event: StreamEvent) => {
      // Remove the stream from 'subscribers' array
      this.deleteSubscriber(event.stream.streamManager);
    });

    // On every asynchronous exception...
    this.session.on('exception', (exception) => {
      console.warn(exception);
    });

    // --- 4) Connect to the session with a valid user token ---
    // 'getToken' method is simulating what your server-side should do.
    // 'token' parameter should be retrieved and returned by your own backend
    this.getToken().then((token) => {
      // First param is the token got from OpenVidu Server. Second param will be used by every user on event
      // 'streamCreated' (property Stream.connection.data), and will be appended to DOM as the user's nickname
      this.session
        .connect(token, { clientData: this.myUserName })
        .then(() => {
          // --- 5) Requesting and Checking Android Permissions
          if (this.platform.is('cordova')) {
            // Ionic platform
            if (this.platform.is('android')) {
              console.log('Android platform');
              this.checkAndroidPermissions()
                .then(() => this.initPublisher())
                .catch(err => console.error(err));
            } else if (this.platform.is('ios')) {
              console.log('iOS platform');
              this.initPublisher();
            }
          } else {
            this.initPublisher();
          }
        })
        .catch(error => {
          console.log('There was an error connecting to the session:', error.code, error.message);
        });
    });
  }

  initPublisher() {
    // Init a publisher passing undefined as targetElement (we don't want OpenVidu to insert a video
    // element: we will manage it on our own) and with the desired properties
    const publisher: Publisher = this.OV.initPublisher(undefined, {
      audioSource: undefined, // The source of audio. If undefined default microphone
      videoSource: undefined, // The source of video. If undefined default webcam
      publishAudio: true, // Whether you want to start publishing with your audio unmuted or not
      publishVideo: true, // Whether you want to start publishing with your video enabled or not
      resolution: '640x480', // The resolution of your video
      frameRate: 30, // The frame rate of your video
      insertMode: 'APPEND', // How the video is inserted in the target element 'video-container'
      mirror: true // Whether to mirror your local video or not
    });

    // --- 6) Publish your stream ---

    this.session.publish(publisher).then(() => {
      // Store our Publisher
      this.publisher = publisher;
    });
  }


  leaveSession() {
    // --- 7) Leave the session by calling 'disconnect' method over the Session object ---

    if (this.session) {
      this.session.disconnect();
    }

    // Empty all properties...
    this.subscribers = [];
    delete this.publisher;
    delete this.session;
    delete this.OV;
    this.generateParticipantInfo();
  }

  refreshVideos() {
    if (this.platform.is('ios') && this.platform.is('cordova')) {
      cordova.plugins.iosrtc.refreshVideos();
    }
  }

  async presentSettingsAlert() {
    const alert = await this.alertController.create({
      header: 'OpenVidu Server config',
      inputs: [
        {
          name: 'url',
          type: 'text',
          value: 'https://demos.openvidu.io',
          placeholder: 'URL'
        },
        {
          name: 'secret',
          type: 'text',
          value: 'MY_SECRET',
          placeholder: 'Secret'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'secondary'
        }, {
          text: 'Ok',
          handler: data => {
            this.OPENVIDU_SERVER_URL = data.url;
            this.OPENVIDU_SERVER_SECRET = data.secret;
          }
        }
      ]
    });

    await alert.present();
  }


  private checkAndroidPermissions(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.platform.ready().then(() => {
        this.androidPermissions
          .requestPermissions(this.ANDROID_PERMISSIONS)
          .then(() => {
            this.androidPermissions
              .checkPermission(this.androidPermissions.PERMISSION.CAMERA)
              .then(camera => {
                this.androidPermissions
                  .checkPermission(this.androidPermissions.PERMISSION.RECORD_AUDIO)
                  .then(audio => {
                    this.androidPermissions
                      .checkPermission(this.androidPermissions.PERMISSION.MODIFY_AUDIO_SETTINGS)
                      .then(modifyAudio => {
                        if (camera.hasPermission && audio.hasPermission && modifyAudio.hasPermission) {
                          resolve();
                        } else {
                          reject(
                            new Error(
                              'Permissions denied: ' +
                              '\n' +
                              ' CAMERA = ' +
                              camera.hasPermission +
                              '\n' +
                              ' AUDIO = ' +
                              audio.hasPermission +
                              '\n' +
                              ' AUDIO_SETTINGS = ' +
                              modifyAudio.hasPermission,
                            ),
                          );
                        }
                      })
                      .catch(err => {
                        console.error(
                          'Checking permission ' +
                          this.androidPermissions.PERMISSION.MODIFY_AUDIO_SETTINGS +
                          ' failed',
                        );
                        reject(err);
                      });
                  })
                  .catch(err => {
                    console.error(
                      'Checking permission ' + this.androidPermissions.PERMISSION.RECORD_AUDIO + ' failed',
                    );
                    reject(err);
                  });
              })
              .catch(err => {
                console.error('Checking permission ' + this.androidPermissions.PERMISSION.CAMERA + ' failed');
                reject(err);
              });
          })
          .catch(err => console.error('Error requesting permissions: ', err));
      });
    });
  }


  private generateParticipantInfo() {
    // Random user nickname and sessionId
    this.mySessionId = 'SessionA';
    this.myUserName = 'Participant' + Math.floor(Math.random() * 100);
  }

  private deleteSubscriber(streamManager: StreamManager): void {
    const index = this.subscribers.indexOf(streamManager, 0);
    if (index > -1) {
      this.subscribers.splice(index, 1);
    }
  }

  /*
       * --------------------------
       * SERVER-SIDE RESPONSIBILITY
       * --------------------------
       * This method retrieve the mandatory user token from OpenVidu Server,
       * in this case making use Angular http API.
       * This behaviour MUST BE IN YOUR SERVER-SIDE IN PRODUCTION. In this case:
       *   1) Initialize a Session in OpenVidu Server	(POST /openvidu/api/sessions)
       *   2) Create a Connection in OpenVidu Server (POST /openvidu/api/sessions/<SESSION_ID>/connection)
       *   3) The Connection.token must be consumed in Session.connect() method
       */

  private getToken(): Promise<string> {
    if (this.platform.is('ios') && this.platform.is('cordova') && this.OPENVIDU_SERVER_URL === 'https://ec2-3-11-81-224.eu-west-2.compute.amazonaws.com') {
      // To make easier first steps with iOS apps, use demos OpenVidu Sever if no custom valid server is configured
      this.OPENVIDU_SERVER_URL = 'https://demos.openvidu.io';
    }
    return this.openViduService.createSession(this.mySessionId)
      .then((sessionId) => this.openViduService.createToken(sessionId));
  }

}