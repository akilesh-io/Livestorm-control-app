import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ChatPageRoutingModule } from './chat-routing.module';

import { ChatPage } from './chat.page';

import { FileSenderComponent } from '../../components/file-sender/file-sender.component';
import { TextMessageComponent } from '../../components/text-message/text-message.component';




@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ChatPageRoutingModule,
  ],
  declarations: [
    ChatPage,
    FileSenderComponent,
    TextMessageComponent
  ],
  providers:[
  ]
})
export class ChatPageModule { }